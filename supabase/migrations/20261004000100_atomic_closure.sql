-- Save each closure action, its history, audit entry, and notices together.
-- Only the Express service role may call these functions. The actor always
-- comes from the authenticated server request, never from the submitted body.
begin;

create function public.request_report_closure(
    p_report_id uuid, p_actor_id uuid, p_outcome text, p_details text, p_ip inet default null
) returns void
language plpgsql security invoker set search_path = '' as $fn$
declare
    r public.reports%rowtype;
    label text;
begin
    perform 1 from public.profiles where id = p_actor_id and role = 'staff' and is_active for share;
    if not found then raise sqlstate 'PT403' using message = 'Only active staff can request closure.'; end if;
    select * into r from public.reports where id = p_report_id for update;
    if not found then raise sqlstate 'PT404' using message = 'That report does not exist.'; end if;
    if r.assigned_staff_id is distinct from p_actor_id then
        raise sqlstate 'PT403' using message = 'Only the assigned staff member can request closure.';
    end if;
    if p_outcome is null or p_outcome not in ('resolved', 'rejected')
       or p_details is null or length(btrim(p_details)) not between 1 and 500 then
        raise sqlstate 'PT400' using message = 'Choose an outcome and enter a comment of 1 to 500 characters.';
    end if;
    if r.closure_requested_at is not null then
        raise sqlstate 'PT409' using message = 'This request was already handled. Reload the report to see its current state.';
    end if;
    if (p_outcome = 'resolved' and r.status <> 'in_progress')
       or (p_outcome = 'rejected' and r.status not in ('under_review', 'in_progress')) then
        raise sqlstate 'PT409' using message = 'The report status changed. Reload the report before requesting closure.';
    end if;
    if p_outcome = 'resolved' and not exists (
        select 1 from public.report_photos where report_id = r.id and kind = 'resolution' and purged_at is null
    ) then
        raise sqlstate 'PT400' using message = 'Upload at least one proof-of-repair photo before requesting resolution.';
    end if;

    update public.reports set closure_requested_at = clock_timestamp(), closure_requested_by = p_actor_id,
        closure_outcome = p_outcome, closure_reason = btrim(p_details) where id = r.id;
    insert into public.report_updates (report_id, updated_by, update_type, details)
    values (r.id, p_actor_id, 'closure_request', case when p_outcome = 'rejected'
        then 'Rejection requested: ' || btrim(p_details) else btrim(p_details) end);
    insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
    values (p_actor_id, 'report.closure_requested', 'report', r.id::text,
        jsonb_build_object('reference_code', r.reference_code, 'outcome', p_outcome), p_ip);

    label := r.reference_code || ' “' || r.title || '”';
    insert into public.notifications (user_id, report_id, message)
    select id, r.id, case when id = r.citizen_id then
        case when p_outcome = 'rejected' then 'Staff found that report ' || r.reference_code ||
            ' cannot be fixed. An administrator will review the reason.'
        else 'Work on report ' || r.reference_code || ' is finished and waiting for verification.' end
    else case when p_outcome = 'rejected' then label || ': staff asked to reject it. It is waiting for your verification.'
        else label || ' is waiting for your verification.' end end
    from public.profiles where id <> p_actor_id and (id = r.citizen_id or (role = 'admin' and is_active));
end;
$fn$;

create function public.review_report_closure(
    p_report_id uuid, p_actor_id uuid, p_expected_requested_at timestamptz,
    p_decision text, p_details text, p_ip inet default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $fn$
declare
    r public.reports%rowtype;
    old_status public.report_status;
    requester uuid;
    label text;
    action_time timestamptz := clock_timestamp();
begin
    perform 1 from public.profiles where id = p_actor_id and role = 'admin' and is_active for share;
    if not found then raise sqlstate 'PT403' using message = 'Only active administrators can review closure.'; end if;
    select * into r from public.reports where id = p_report_id for update;
    if not found then raise sqlstate 'PT404' using message = 'That report does not exist.'; end if;
    if p_decision is null or p_decision not in ('approve', 'return')
       or p_details is null or length(btrim(p_details)) not between 1 and 500 then
        raise sqlstate 'PT400' using message = 'Choose a decision and enter a comment of 1 to 500 characters.';
    end if;
    if p_expected_requested_at is null or r.closure_requested_at is distinct from p_expected_requested_at
       or r.verified_at is not null or r.status not in ('under_review', 'in_progress') then
        raise sqlstate 'PT409' using message = 'This request changed or was already handled. Reload the report before deciding.';
    end if;
    if p_decision = 'approve' and r.closure_requested_by = p_actor_id then
        raise sqlstate 'PT403' using message = 'A different administrator must approve your closure request.';
    end if;

    old_status := r.status;
    requester := r.closure_requested_by;
    label := r.reference_code || ' “' || r.title || '”';
    if p_decision = 'return' then
        update public.reports set closure_requested_at = null, closure_requested_by = null,
            closure_outcome = null, closure_reason = null where id = r.id returning * into r;
        insert into public.report_updates (report_id, updated_by, update_type, details)
        values (r.id, p_actor_id, 'verification', 'Returned for more work. ' || btrim(p_details));
        insert into public.notifications (user_id, report_id, message)
        select id, r.id, label || ' was returned for more work: ' || btrim(p_details)
        from public.profiles where id <> p_actor_id and id in (requester, r.assigned_staff_id);
    else
        if r.closure_outcome is null or r.closure_outcome not in ('resolved', 'rejected') then
            raise sqlstate 'PT400' using message = 'This request asks for an outcome that cannot be applied. Return it instead.';
        end if;
        update public.reports set status = r.closure_outcome::public.report_status,
            resolved_at = case when r.closure_outcome = 'resolved' then action_time else null end,
            status_changed_at = action_time, verified_by = p_actor_id, verified_at = action_time,
            is_public = true where id = r.id returning * into r;
        insert into public.report_updates (report_id, updated_by, update_type, previous_status, new_status, details)
        values (r.id, p_actor_id, 'verification', old_status, r.status, btrim(p_details));
        insert into public.notifications (user_id, report_id, message)
        select id, r.id, case when id = r.citizen_id then
            case when r.status = 'rejected' then 'Report ' || r.reference_code || ' was rejected: ' || r.closure_reason
            else 'Report ' || r.reference_code || ' is now "' || r.status || '".' end
        else label || ' was verified and closed as "' || r.status || '".' end
        from public.profiles where id <> p_actor_id and id in (r.citizen_id, requester, r.assigned_staff_id);
    end if;
    insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
    values (p_actor_id, case when p_decision = 'approve' then 'report.closure_approved' else 'report.closure_returned' end,
        'report', r.id::text, jsonb_build_object('reference_code', r.reference_code) ||
        case when p_decision = 'approve' then jsonb_build_object('outcome', r.closure_outcome, 'to', r.status)
        else '{}'::jsonb end, p_ip);

    return jsonb_build_object('status', r.status, 'resolved_at', r.resolved_at, 'updated_at', r.updated_at,
        'status_changed_at', r.status_changed_at, 'closure_requested_at', r.closure_requested_at,
        'closure_outcome', r.closure_outcome, 'closure_reason', r.closure_reason,
        'verified_at', r.verified_at, 'is_public', r.is_public);
end;
$fn$;

revoke all on function public.request_report_closure(uuid, uuid, text, text, inet) from public, anon, authenticated;
revoke all on function public.review_report_closure(uuid, uuid, timestamptz, text, text, inet) from public, anon, authenticated;
grant execute on function public.request_report_closure(uuid, uuid, text, text, inet) to service_role;
grant execute on function public.review_report_closure(uuid, uuid, timestamptz, text, text, inet) to service_role;
commit;
