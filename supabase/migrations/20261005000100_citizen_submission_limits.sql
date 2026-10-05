begin;

create table public.citizen_submission_events (
    id bigint generated always as identity primary key,
    operation text not null check (operation in ('report', 'photo', 'proof')),
    scope text not null check (scope in ('account', 'network')),
    subject_key text not null check (length(subject_key) between 1 and 128),
    admitted_at timestamptz not null,
    expires_at timestamptz not null,
    check (expires_at = admitted_at + interval '3600 seconds')
);
create index citizen_submission_events_subject_idx
    on public.citizen_submission_events (operation, scope, subject_key, admitted_at, id);
create index citizen_submission_events_expiry_idx
    on public.citizen_submission_events (expires_at, id);
alter table public.citizen_submission_events enable row level security;
revoke all on public.citizen_submission_events from public, anon, authenticated, service_role;
grant select, insert, delete on public.citizen_submission_events to service_role;
-- Row locking for bounded cleanup needs UPDATE on at least one column.
grant update (id) on public.citizen_submission_events to service_role;
revoke all on sequence public.citizen_submission_events_id_seq from public, anon, authenticated, service_role;
grant usage on sequence public.citizen_submission_events_id_seq to service_role;

create function public.purge_citizen_submission_events() returns integer
language plpgsql volatile security invoker set search_path = ''
set statement_timeout = '4s' set lock_timeout = '2s' as $fn$
declare
    purge_time timestamptz := pg_catalog.clock_timestamp();
    deleted_count integer;
begin
    with expired as (
        select id from public.citizen_submission_events
        where expires_at <= purge_time
        order by expires_at, id limit 256 for update skip locked
    )
    delete from public.citizen_submission_events e using expired
    where e.id = expired.id and e.expires_at <= purge_time;
    get diagnostics deleted_count = row_count;
    return deleted_count;
end;
$fn$;

create function public.admit_citizen_operation(p_actor_id uuid, p_network_key text, p_action text)
returns jsonb language plpgsql volatile security invoker set search_path = ''
set statement_timeout = '4s' set lock_timeout = '2s'
set default_transaction_isolation = 'read committed' as $fn$
declare
    actor public.profiles%rowtype;
    operations text[];
    operation_name text;
    scope_name text;
    subject text;
    scope_limit integer;
    live_count bigint;
    lock_id bigint;
    admission_time timestamptz;
    scope_retry_at timestamptz;
    retry_at timestamptz;
    limiting_operation text;
begin
    if p_actor_id is null or p_network_key is null or length(p_network_key) not between 1 and 128 then
        raise exception 'Invalid citizen admission identity';
    end if;
    operations := case p_action
        when 'report.create.json' then array['report']
        when 'report.create.multipart' then array['report', 'photo']
        when 'report.photo' then array['photo']
        when 'residency.proof' then array['proof']
        else null end;
    if operations is null then raise exception 'Unknown citizen admission action'; end if;
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'Citizen admission requires READ COMMITTED';
    end if;

    select * into actor from public.profiles where id = p_actor_id for share;
    if not found or actor.role <> 'citizen' or not actor.is_active then
        raise sqlstate 'PT403' using message = 'Only active citizens can submit this request.';
    end if;
    if p_action = 'residency.proof' then
        if actor.residency_status = 'verified' then
            raise sqlstate 'PT400' using message = 'Your residency is already confirmed. There is nothing more to upload.';
        end if;
    elsif actor.residency_status is distinct from 'verified' and
        (actor.residency_status = 'rejected' or nullif(actor.residency_proof_path, '') is null) then
        raise sqlstate 'PT403' using message = 'Upload your proof of residency to continue.';
    end if;

    perform public.purge_citizen_submission_events();
    -- Sort numeric hashes, since hash collisions can change the ordering of logical keys.
    for lock_id in
        select distinct pg_catalog.hashtextextended('kamoti:citizen-admission:' || o.operation || ':' || s.scope || ':' || s.subject, 0) as id
        from pg_catalog.unnest(operations) as o(operation)
        cross join (values ('account', p_actor_id::text), ('network', p_network_key)) as s(scope, subject)
        order by id
    loop
        perform pg_catalog.pg_advisory_xact_lock(lock_id);
    end loop;
    admission_time := pg_catalog.clock_timestamp();

    foreach operation_name in array operations loop
        foreach scope_name in array array['account', 'network'] loop
            subject := case scope_name when 'account' then p_actor_id::text else p_network_key end;
            scope_limit := case operation_name
                when 'report' then case scope_name when 'account' then 5 else 50 end
                when 'photo' then case scope_name when 'account' then 15 else 150 end
                when 'proof' then case scope_name when 'account' then 3 else 30 end end;
            select count(*) into live_count from public.citizen_submission_events e
            where e.operation = operation_name and e.scope = scope_name and e.subject_key = subject
                and e.admitted_at > admission_time - interval '3600 seconds';
            if live_count >= scope_limit then
                select e.expires_at into scope_retry_at from public.citizen_submission_events e
                where e.operation = operation_name and e.scope = scope_name and e.subject_key = subject
                    and e.admitted_at > admission_time - interval '3600 seconds'
                order by e.admitted_at, e.id offset (live_count - scope_limit) limit 1;
                if retry_at is null or scope_retry_at > retry_at then
                    retry_at := scope_retry_at;
                    limiting_operation := operation_name;
                end if;
            end if;
        end loop;
    end loop;
    if retry_at is not null then
        return pg_catalog.jsonb_build_object('kind', 'limited', 'operation', limiting_operation,
            'retry_after_seconds', greatest(1, ceil(extract(epoch from retry_at - admission_time)))::integer,
            'retry_at', retry_at);
    end if;

    insert into public.citizen_submission_events (operation, scope, subject_key, admitted_at, expires_at)
    select o.operation, s.scope, s.subject, admission_time, admission_time + interval '3600 seconds'
    from pg_catalog.unnest(operations) as o(operation)
    cross join (values ('account', p_actor_id::text), ('network', p_network_key)) as s(scope, subject);
    return '{"kind":"allowed"}'::jsonb;
end;
$fn$;

revoke all on function public.admit_citizen_operation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.purge_citizen_submission_events() from public, anon, authenticated;
grant execute on function public.admit_citizen_operation(uuid, text, text) to service_role;
grant execute on function public.purge_citizen_submission_events() to service_role;

commit;
