-- #67: an Administrator's name correction keeps the residency decision.
--
-- Owner decision (2026-10-15): when an Administrator corrects only a Citizen's
-- name (first, middle, last, suffix, or the composed name) through
-- admin_change_profile, a verified decision stays verified, and the audit
-- records residency_kept. (Rejected decisions were already kept.) A
-- Citizen's own name change still returns to review, because the #63 approval
-- checked the name on the document. Address and proof changes still return to
-- review, from anyone. The review version still changes on every identity
-- change, so a review opened before the correction must refresh.
--
-- admin_change_profile marks its own update with the transaction-local setting
-- kamoti.residency_actor = 'admin' and clears it right after; the setting is
-- also reverted with any rolled-back transaction or savepoint. Only the
-- service role can run either function or update profiles directly.
--
-- Only the trigger condition and the user.updated branch differ from
-- 20261006000100 and 20261015000200. No tables or columns change.
--
-- Deploy: apply before or with the matching API. The earlier API calls the same
-- function with the same input, so either order is safe.

begin;

create or replace function public.version_residency_review() returns trigger
language plpgsql security invoker set search_path = '' as $fn$
declare
    identity_changed boolean;
    proof_changed boolean;
    admin_name_correction boolean;
begin
    identity_changed := row(new.name, new.first_name, new.middle_name, new.last_name, new.suffix, new.barangay, new.address_line)
        is distinct from row(old.name, old.first_name, old.middle_name, old.last_name, old.suffix, old.barangay, old.address_line);
    proof_changed := row(new.residency_proof_id, new.residency_proof_path)
        is distinct from row(old.residency_proof_id, old.residency_proof_path);
    -- #67: only the name changed, and admin_change_profile made the change.
    admin_name_correction := identity_changed
        and row(new.barangay, new.address_line) is not distinct from row(old.barangay, old.address_line)
        and current_setting('kamoti.residency_actor', true) is not distinct from 'admin';
    if proof_changed or (identity_changed and not admin_name_correction and old.residency_status in ('pending', 'verified')) then
        new.residency_status := 'pending';
        new.residency_note := null;
        new.residency_reviewed_by := null;
        new.residency_reviewed_at := null;
    end if;
    if identity_changed or proof_changed or row(new.role, new.is_active, new.residency_status,
        new.residency_note, new.residency_reviewed_by, new.residency_reviewed_at)
        is distinct from row(old.role, old.is_active, old.residency_status,
            old.residency_note, old.residency_reviewed_by, old.residency_reviewed_at) then
        new.residency_review_version := gen_random_uuid();
    else
        new.residency_review_version := old.residency_review_version;
    end if;
    if proof_changed and old.residency_proof_id is not null then
        update public.residency_proof_versions set superseded_at = coalesce(superseded_at, clock_timestamp())
        where id = old.residency_proof_id;
    end if;
    return new;
end;
$fn$;

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
        -- #67: the trigger keeps the residency decision for this name correction.
        perform set_config('kamoti.residency_actor', 'admin', true);
        update public.profiles set name = changed.name, first_name = changed.first_name,
            middle_name = changed.middle_name, last_name = changed.last_name, suffix = changed.suffix,
            role = changed.role, contact_number = changed.contact_number, is_active = changed.is_active,
            phone_verified_at = case when p_input ? 'contact_number' then null else u.phone_verified_at end
        where id = u.id returning * into changed;
        perform set_config('kamoti.residency_actor', '', true);
        audit_metadata := p_input || case when p_input ? 'role' then jsonb_build_object('previous_role', u.role) else '{}'::jsonb end
            || case when u.residency_status = 'verified' and changed.residency_status = 'verified'
                and row(changed.name, changed.first_name, changed.middle_name, changed.last_name, changed.suffix)
                    is distinct from row(u.name, u.first_name, u.middle_name, u.last_name, u.suffix)
                then '{"residency_kept":"verified"}'::jsonb else '{}'::jsonb end;
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
