-- #63: residency decisions record their basis.
--
-- Owner decisions (2026-10-15): an approval either rests on the uploaded document,
-- after the Administrator confirms the name, the Makati address, readability, and
-- an accepted document type within its date rule; or it is the explicit
-- "approved without a document" exception, with a reason. Rejection is unchanged.
-- The basis goes into the required residency.reviewed audit entry; no columns
-- change. Only the residency.reviewed branch of admin_change_profile differs from
-- 20261006000100.
--
-- Deploy: apply right before the matching API. Until it is deployed, approvals
-- from the earlier API (which sends no method) are refused; rejections work.

begin;

create or replace function public.admin_change_profile(
    p_actor_id uuid, p_user_id uuid, p_action text, p_input jsonb, p_ip inet default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $fn$
declare
    u public.profiles%rowtype;
    changed public.profiles%rowtype;
    audit_metadata jsonb := '{}'::jsonb;
    reviewer jsonb;
    expected_version uuid;
    review_method text;
    review_checks jsonb;
begin
    perform 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active for share;
    if not found then raise sqlstate 'PT403' using message = 'Only active administrators can change accounts.'; end if;
    select * into u from public.profiles where id = p_user_id for update;
    if not found then raise sqlstate 'PT404' using message = 'That user does not exist.'; end if;
    if p_input is null or jsonb_typeof(p_input) <> 'object' then
        raise sqlstate 'PT400' using message = 'Account changes must be an object.';
    end if;

    if p_action = 'user.updated' then
        if p_input - array['name', 'first_name', 'middle_name', 'last_name', 'suffix', 'role', 'contact_number', 'is_active'] <> '{}'::jsonb then
            raise sqlstate 'PT400' using message = 'These account fields cannot be changed here.';
        end if;
        if p_actor_id = p_user_id and (p_input ? 'role' or p_input @> '{"is_active":false}'::jsonb) then
            raise sqlstate 'PT400' using message = 'You cannot change your own role or deactivate your own account.';
        end if;
        changed := jsonb_populate_record(u, p_input);
        update public.profiles set name = changed.name, first_name = changed.first_name,
            middle_name = changed.middle_name, last_name = changed.last_name, suffix = changed.suffix,
            role = changed.role, contact_number = changed.contact_number, is_active = changed.is_active,
            phone_verified_at = case when p_input ? 'contact_number' then null else u.phone_verified_at end
        where id = u.id returning * into changed;
        audit_metadata := p_input || case when p_input ? 'role' then jsonb_build_object('previous_role', u.role) else '{}'::jsonb end;
    elsif p_action = 'residency.reviewed' then
        if p_input - array['decision', 'note', 'expected_version', 'method', 'checks'] <> '{}'::jsonb
           or (p_input->>'decision') is null or p_input->>'decision' not in ('verified', 'rejected') then
            raise sqlstate 'PT400' using message = 'Choose whether to accept or reject the proof.';
        end if;
        if jsonb_typeof(p_input->'expected_version') is distinct from 'string' then
            raise sqlstate 'PT400' using message = 'The current residency review version is required.';
        end if;
        begin
            expected_version := (p_input->>'expected_version')::uuid;
        exception when invalid_text_representation then
            raise sqlstate 'PT400' using message = 'The residency review version must be a UUID.';
        end;
        if u.residency_review_version <> expected_version then
            raise sqlstate 'PT409' using message = 'These residency details changed. Refresh the review before you decide.';
        end if;
        if u.role <> 'citizen' then raise sqlstate 'PT400' using message = 'Only citizens have a residency to confirm.'; end if;
        -- #63: an approval names its basis. "document" needs a current proof and
        -- all four checks; "no_document" is the owner-approved exception and needs
        -- a reason, which stays in the audit (the Citizen never sees it).
        review_method := nullif(p_input->>'method', '');
        review_checks := case when jsonb_typeof(p_input->'checks') = 'null' then null else p_input->'checks' end;
        if p_input->>'decision' = 'rejected' then
            if review_method is not null or review_checks is not null then
                raise sqlstate 'PT400' using message = 'A rejection has no approval method or checks.';
            end if;
            if u.residency_proof_path is null then raise sqlstate 'PT400' using message = 'There is no proof to reject.'; end if;
            if p_input->>'note' is null or length(btrim(p_input->>'note')) not between 5 and 500 then
                raise sqlstate 'PT400' using message = 'Say why the proof was not accepted.';
            end if;
        elsif review_method is null or review_method not in ('document', 'no_document') then
            raise sqlstate 'PT400' using message = 'Choose how you confirmed this resident.';
        elsif review_method = 'document' then
            if u.residency_proof_path is null then
                raise sqlstate 'PT400' using message = 'There is no proof to accept. Approve without a document instead, with a reason.';
            end if;
            if review_checks is null or jsonb_typeof(review_checks) <> 'array' or jsonb_array_length(review_checks) <> 4
               or (select count(distinct c) from jsonb_array_elements_text(review_checks) as c
                   where c in ('name', 'address', 'readable', 'document')) <> 4 then
                raise sqlstate 'PT400' using message = 'Confirm all four checks before accepting the document.';
            end if;
            if nullif(btrim(coalesce(p_input->>'note', '')), '') is not null then
                raise sqlstate 'PT400' using message = 'A document approval takes no reason.';
            end if;
        else
            if review_checks is not null then
                raise sqlstate 'PT400' using message = 'An approval without a document has no document checks.';
            end if;
            if p_input->>'note' is null or length(btrim(p_input->>'note')) not between 5 and 500 then
                raise sqlstate 'PT400' using message = 'Say how you confirmed this resident without a document.';
            end if;
        end if;
        update public.profiles set residency_status = p_input->>'decision',
            residency_note = case when p_input->>'decision' = 'rejected' then btrim(p_input->>'note') else null end,
            residency_reviewed_by = p_actor_id, residency_reviewed_at = clock_timestamp()
        where id = u.id returning * into changed;
        audit_metadata := jsonb_build_object('decision', changed.residency_status, 'note', changed.residency_note,
            'expected_version', expected_version, 'residency_review_version', u.residency_review_version,
            'residency_proof_id', u.residency_proof_id, 'name', u.name, 'first_name', u.first_name,
            'middle_name', u.middle_name, 'last_name', u.last_name, 'suffix', u.suffix,
            'barangay', u.barangay, 'address_line', u.address_line, 'role', u.role, 'is_active', u.is_active,
            'method', review_method, 'checks', review_checks,
            'exception_reason', case when review_method = 'no_document' then btrim(p_input->>'note') end);
        insert into public.notifications (user_id, message) values (u.id,
            case when changed.residency_status = 'verified' then
                'Your proof of residency was accepted. Your reports no longer show "Unverified resident".'
            else 'Your proof of residency was not accepted: ' || changed.residency_note ||
                ' Upload a new proof to continue using KAMOTI.' end);
    elsif p_action in ('user.phone_verified', 'user.phone_unverified') then
        if p_input <> '{}'::jsonb then raise sqlstate 'PT400' using message = 'Unexpected mobile verification fields.'; end if;
        if p_action = 'user.phone_verified' and u.contact_number is null then
            raise sqlstate 'PT400' using message = 'This account has no mobile number to verify.';
        end if;
        update public.profiles set phone_verified_at = case when p_action = 'user.phone_verified' then clock_timestamp() else null end
        where id = u.id returning * into changed;
    else
        raise sqlstate 'PT400' using message = 'That account action is not supported.';
    end if;

    insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
    values (p_actor_id, p_action, 'user', u.id::text, audit_metadata, p_ip);
    if changed.residency_reviewed_by is not null then
        select jsonb_build_object('id', id, 'name', name) into reviewer
        from public.profiles where id = changed.residency_reviewed_by;
    end if;
    return jsonb_build_object('id', changed.id, 'name', changed.name,
        'first_name', changed.first_name, 'middle_name', changed.middle_name, 'last_name', changed.last_name,
        'suffix', changed.suffix, 'email', changed.email, 'role', changed.role,
        'contact_number', changed.contact_number, 'phone_verified_at', changed.phone_verified_at,
        'barangay', changed.barangay, 'address_line', changed.address_line,
        'residency_status', changed.residency_status, 'residency_note', changed.residency_note,
        'is_active', changed.is_active, 'created_at', changed.created_at,
        'residency_reviewed_at', changed.residency_reviewed_at, 'reviewer', reviewer,
        'has_residency_proof', changed.residency_proof_path is not null,
        'residency_proof_id', changed.residency_proof_id, 'residency_review_version', changed.residency_review_version);
end;
$fn$;
revoke all on function public.admin_change_profile(uuid, uuid, text, jsonb, inet) from public, anon, authenticated;
grant execute on function public.admin_change_profile(uuid, uuid, text, jsonb, inet) to service_role;

notify pgrst, 'reload schema';

commit;
