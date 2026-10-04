-- Privileged profile changes must retain their audit record or roll back.
begin;
create function public.admin_create_profile(
    p_actor_id uuid, p_user_id uuid, p_input jsonb, p_ip inet default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $fn$
declare
    u public.profiles%rowtype;
begin
    perform 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active for share;
    if not found then raise sqlstate 'PT403' using message = 'Only active administrators can create accounts.'; end if;
    if p_input is null or jsonb_typeof(p_input) <> 'object' or p_input - array[
        'name', 'first_name', 'middle_name', 'last_name', 'suffix', 'email', 'role', 'contact_number'
    ] <> '{}'::jsonb then
        raise sqlstate 'PT400' using message = 'Unexpected account fields.';
    end if;
    insert into public.profiles (id, name, first_name, middle_name, last_name, suffix, email, role, contact_number, residency_status)
    values (p_user_id, p_input->>'name', p_input->>'first_name', p_input->>'middle_name', p_input->>'last_name',
        p_input->>'suffix', p_input->>'email', (p_input->>'role')::public.user_role, p_input->>'contact_number',
        case when p_input->>'role' = 'citizen' then 'pending' else null end) returning * into u;
    insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
    values (p_actor_id, 'user.created', 'user', u.id::text, jsonb_build_object('role', u.role), p_ip);
    -- The API validates and selects the administrator response fields. The
    -- private object key is removed here as well as at that boundary.
    return (to_jsonb(u) - 'residency_proof_path') || jsonb_build_object('has_residency_proof', false, 'reviewer', null);
end;
$fn$;
revoke all on function public.admin_create_profile(uuid, uuid, jsonb, inet) from public, anon, authenticated;
grant execute on function public.admin_create_profile(uuid, uuid, jsonb, inet) to service_role;

create function public.admin_change_profile(
    p_actor_id uuid, p_user_id uuid, p_action text, p_input jsonb, p_ip inet default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $fn$
declare
    u public.profiles%rowtype;
    changed public.profiles%rowtype;
    audit_metadata jsonb := '{}'::jsonb;
    reviewer jsonb;
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
        if p_input - array['decision', 'note'] <> '{}'::jsonb
           or (p_input->>'decision') is null or p_input->>'decision' not in ('verified', 'rejected') then
            raise sqlstate 'PT400' using message = 'Choose whether to accept or reject the proof.';
        end if;
        if u.role <> 'citizen' then raise sqlstate 'PT400' using message = 'Only citizens have a residency to confirm.'; end if;
        if p_input->>'decision' = 'rejected' then
            if u.residency_proof_path is null then raise sqlstate 'PT400' using message = 'There is no proof to reject.'; end if;
            if p_input->>'note' is null or length(btrim(p_input->>'note')) not between 5 and 500 then
                raise sqlstate 'PT400' using message = 'Say why the proof was not accepted.';
            end if;
        end if;
        update public.profiles set residency_status = p_input->>'decision',
            residency_note = case when p_input->>'decision' = 'rejected' then btrim(p_input->>'note') else null end,
            residency_reviewed_by = p_actor_id, residency_reviewed_at = clock_timestamp()
        where id = u.id returning * into changed;
        audit_metadata := jsonb_build_object('decision', changed.residency_status, 'note', changed.residency_note);
        insert into public.notifications (user_id, message) values (u.id,
            case when changed.residency_status = 'verified' then
                'Your proof of residency was accepted. Your reports no longer show “Unverified resident”.'
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
        'has_residency_proof', changed.residency_proof_path is not null);
end;
$fn$;
revoke all on function public.admin_change_profile(uuid, uuid, text, jsonb, inet) from public, anon, authenticated;
grant execute on function public.admin_change_profile(uuid, uuid, text, jsonb, inet) to service_role;
commit;
