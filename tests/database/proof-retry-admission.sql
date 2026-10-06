\set ON_ERROR_STOP on
begin;

do $$ begin
    if current_setting('kamoti.test_database', true) is distinct from 'disposable'
        or inet_server_addr() is null
        or inet_server_addr() not in ('127.0.0.1'::inet, '::1'::inet) then
        raise exception 'Run proof retry admission tests only on a local disposable database.';
    end if;
end $$;

create temporary table proof_retry_checks (name text primary key);
grant select, insert on proof_retry_checks to service_role;
create function pg_temp.check_that(ok boolean, label text) returns void language plpgsql as $$
begin
    if ok is distinct from true then raise exception 'Check failed: %', label; end if;
    insert into proof_retry_checks values (label);
end $$;

create function pg_temp.must_refuse(statement text, expected_state text, label text)
returns void language plpgsql as $$
declare
    refused boolean := false;
    events_before jsonb;
begin
    select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb)
    into events_before from public.citizen_submission_events e;
    begin execute statement;
    exception when others then
        if sqlstate <> expected_state then raise; end if;
        refused := true;
    end;
    perform pg_temp.check_that(refused, label);
    perform pg_temp.check_that((select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb)
        = events_before from public.citizen_submission_events e), label || ' changes no quota events');
end $$;

insert into auth.users (id) values
    ('f6100000-0000-4000-8000-000000000001'), ('f6100000-0000-4000-8000-000000000002'),
    ('f6100000-0000-4000-8000-000000000003'), ('f6100000-0000-4000-8000-000000000004'),
    ('f6100000-0000-4000-8000-000000000005'), ('f6100000-0000-4000-8000-000000000006'),
    ('f6100000-0000-4000-8000-000000000007'), ('f6100000-0000-4000-8000-000000000008');
insert into public.profiles (id, name, email, role, residency_status) values
    ('f6100000-0000-4000-8000-000000000001', 'Retry Administrator', 'proof-retry-admin@kamoti.invalid', 'admin', null),
    ('f6100000-0000-4000-8000-000000000002', 'Retry Citizen', 'proof-retry-citizen@kamoti.invalid', 'citizen', 'pending'),
    ('f6100000-0000-4000-8000-000000000003', 'Foreign Receipt', 'proof-retry-foreign@kamoti.invalid', 'citizen', 'pending'),
    ('f6100000-0000-4000-8000-000000000004', 'Legacy Receipt', 'proof-retry-legacy@kamoti.invalid', 'citizen', 'pending'),
    ('f6100000-0000-4000-8000-000000000005', 'Pending No Proof', 'proof-retry-none@kamoti.invalid', 'citizen', 'pending'),
    ('f6100000-0000-4000-8000-000000000006', 'Pending With Proof', 'proof-retry-pending@kamoti.invalid', 'citizen', 'pending'),
    ('f6100000-0000-4000-8000-000000000007', 'Inactive Citizen', 'proof-retry-inactive@kamoti.invalid', 'citizen', 'pending'),
    ('f6100000-0000-4000-8000-000000000008', 'Changed Role', 'proof-retry-role@kamoti.invalid', 'citizen', 'pending');

do $$
declare
    citizen uuid;
    proof uuid;
    object_path text;
    review_version uuid;
begin
    for fixture in 1..8 loop
        if fixture not in (1, 2, 3, 6, 7, 8) then continue; end if;
        citizen := case when fixture = 1 then 'f6100000-0000-4000-8000-000000000002'::uuid
            else ('f6100000-0000-4000-8000-' || lpad(fixture::text, 12, '0'))::uuid end;
        proof := ('f6110000-0000-4000-8000-' || lpad(fixture::text, 12, '0'))::uuid;
        object_path := citizen::text || '/' || proof::text || '.pdf';
        insert into storage.objects (bucket_id, name) values ('residency-proofs', object_path);
        select residency_review_version into review_version from public.profiles where id = citizen;
        perform public.complete_residency_proof(citizen, proof, object_path, repeat('a', 64), review_version);
    end loop;
end $$;

insert into public.residency_proof_versions (id, user_id, object_path) values
    ('f6110000-0000-4000-8000-000000000004', 'f6100000-0000-4000-8000-000000000004', 'proof-retry/legacy.pdf');
update public.profiles set residency_proof_id = 'f6110000-0000-4000-8000-000000000004',
    residency_proof_path = 'proof-retry/legacy.pdf'
where id = 'f6100000-0000-4000-8000-000000000004';
do $$
declare citizen uuid; review_version uuid;
begin
    for fixture in 2..8 loop
        if fixture not in (2, 3, 4, 7, 8) then continue; end if;
        citizen := ('f6100000-0000-4000-8000-' || lpad(fixture::text, 12, '0'))::uuid;
        select residency_review_version into review_version from public.profiles where id = citizen;
        perform public.admin_change_profile('f6100000-0000-4000-8000-000000000001', citizen,
            'residency.reviewed', jsonb_build_object('decision', 'verified', 'expected_version', review_version));
    end loop;
end $$;
update public.profiles set is_active = false where id = 'f6100000-0000-4000-8000-000000000007';
update public.profiles set role = 'staff' where id = 'f6100000-0000-4000-8000-000000000008';

create temporary table proof_retry_baseline as
select
    (select jsonb_agg(to_jsonb(p) order by p.id) from public.profiles p
        where p.id::text like 'f6100000-%') as profiles,
    (select jsonb_agg(to_jsonb(v) order by v.id) from public.residency_proof_versions v
        where v.id::text like 'f6110000-%') as receipts,
    (select count(*) from public.activity_logs) as audits,
    (select count(*) from public.notifications) as notifications;
grant select on proof_retry_baseline to service_role;

set local role service_role;
do $$
declare
    citizen constant uuid := 'f6100000-0000-4000-8000-000000000002';
    current_proof constant uuid := 'f6110000-0000-4000-8000-000000000002';
    old_proof constant uuid := 'f6110000-0000-4000-8000-000000000001';
    result jsonb;
begin
    perform pg_temp.check_that((select residency_status = 'verified' and residency_proof_id = current_proof
        from public.profiles where id = citizen), 'Retry fixture has an approved current proof');
    perform pg_temp.check_that((select sha256 is not null and superseded_at is not null
        from public.residency_proof_versions where id = old_proof), 'Retry fixture retains a committed superseded receipt');
    perform pg_temp.must_refuse(format('select public.admit_citizen_operation(%L,%L,%L)',
        citizen, '192.0.2.61', 'residency.proof'), 'PT400', 'Verified Citizen cannot upload without a receipt');
    perform pg_temp.must_refuse(format('select public.admit_citizen_operation(%L,%L,%L,%L)',
        citizen, '192.0.2.61', 'residency.proof', 'f6110000-0000-4000-8000-000000000099'),
        'PT400', 'Verified Citizen cannot upload with an unknown receipt');
    perform pg_temp.must_refuse(format('select public.admit_citizen_operation(%L,%L,%L,%L)',
        citizen, '192.0.2.61', 'residency.proof', 'f6110000-0000-4000-8000-000000000003'),
        'PT400', 'Verified Citizen cannot use another Citizen receipt');
    perform pg_temp.must_refuse(format('select public.admit_citizen_operation(%L,%L,%L,%L)',
        'f6100000-0000-4000-8000-000000000004', '192.0.2.61', 'residency.proof',
        'f6110000-0000-4000-8000-000000000004'), 'PT400', 'Verified Citizen cannot retry a legacy receipt without a hash');

    result := public.admit_citizen_operation(citizen, '192.0.2.61', 'residency.proof', current_proof);
    perform pg_temp.check_that(result = '{"kind":"allowed"}'::jsonb, 'Verified Citizen can retry the current committed proof');
    result := public.admit_citizen_operation(citizen, '192.0.2.61', 'residency.proof', old_proof);
    perform pg_temp.check_that(result = '{"kind":"allowed"}'::jsonb, 'Verified Citizen can retry a superseded committed proof');
    result := public.admit_citizen_operation(citizen, '192.0.2.61', 'residency.proof', current_proof);
    perform pg_temp.check_that(result = '{"kind":"allowed"}'::jsonb, 'Third proof retry uses the remaining account allowance');
    result := public.admit_citizen_operation(citizen, '192.0.2.62', 'residency.proof', old_proof);
    perform pg_temp.check_that(result->>'kind' = 'limited' and result->>'operation' = 'proof'
        and (result->>'retry_after_seconds')::integer between 3590 and 3600
        and (result->>'retry_at')::timestamptz > clock_timestamp(),
        'Fourth proof retry is limited for one hour across networks');
    perform pg_temp.check_that((select count(*) = 3 from public.citizen_submission_events
        where operation = 'proof' and scope = 'account' and subject_key = citizen::text)
        and (select count(*) = 3 from public.citizen_submission_events
            where operation = 'proof' and scope = 'network' and subject_key = '192.0.2.61')
        and not exists (select 1 from public.citizen_submission_events
            where scope = 'network' and subject_key = '192.0.2.62'),
        'Proof retries spend three account and network attempts and refusal spends none');

    perform pg_temp.must_refuse(format('select public.admit_citizen_operation(%L,%L,%L,%L)',
        'f6100000-0000-4000-8000-000000000007', '192.0.2.63', 'residency.proof',
        'f6110000-0000-4000-8000-000000000007'), 'PT403', 'Deactivated Citizen cannot retry an owned committed proof');
    perform pg_temp.must_refuse(format('select public.admit_citizen_operation(%L,%L,%L,%L)',
        'f6100000-0000-4000-8000-000000000008', '192.0.2.63', 'residency.proof',
        'f6110000-0000-4000-8000-000000000008'), 'PT403', 'Citizen changed to Staff cannot retry an owned committed proof');

    result := public.admit_citizen_operation('f6100000-0000-4000-8000-000000000005', '192.0.2.64', 'residency.proof');
    perform pg_temp.check_that(result = '{"kind":"allowed"}'::jsonb, 'Three argument proof admission still allows a pending Citizen without proof');
    perform pg_temp.must_refuse(format('select public.admit_citizen_operation(%L,%L,%L)',
        'f6100000-0000-4000-8000-000000000005', '192.0.2.64', 'report.create.json'),
        'PT403', 'Proof admission alone does not unlock reporting');
    result := public.admit_citizen_operation('f6100000-0000-4000-8000-000000000006', '192.0.2.65', 'report.create.json');
    perform pg_temp.check_that(result = '{"kind":"allowed"}'::jsonb, 'Three argument JSON admission still allows pending residency with proof');
    result := public.admit_citizen_operation('f6100000-0000-4000-8000-000000000006', '192.0.2.65', 'report.create.multipart');
    perform pg_temp.check_that(result = '{"kind":"allowed"}'::jsonb, 'Three argument multipart admission still allows pending residency with proof');
    result := public.admit_citizen_operation('f6100000-0000-4000-8000-000000000006', '192.0.2.65', 'report.photo');
    perform pg_temp.check_that(result = '{"kind":"allowed"}'::jsonb, 'Three argument photo admission still allows pending residency with proof');
    perform pg_temp.check_that((select count(*) = 2 from public.citizen_submission_events
        where operation = 'report' and scope = 'account' and subject_key = 'f6100000-0000-4000-8000-000000000006')
        and (select count(*) = 2 from public.citizen_submission_events
            where operation = 'photo' and scope = 'account' and subject_key = 'f6100000-0000-4000-8000-000000000006'),
        'Default callers retain separate report and photo charges');
    result := public.admit_citizen_operation(citizen, '192.0.2.61', 'report.create.json');
    perform pg_temp.check_that(result = '{"kind":"allowed"}'::jsonb, 'Proof retry exhaustion does not consume the report allowance');
end $$;
reset role;

insert into public.citizen_submission_events (operation, scope, subject_key, admitted_at, expires_at)
select 'proof', 'network', '192.0.2.66', deadline - interval '1 hour', deadline
from generate_series(1, 30), (select clock_timestamp() + interval '50 minutes' as deadline) timing;
set local role service_role;
do $$ declare result jsonb; begin
    result := public.admit_citizen_operation('f6100000-0000-4000-8000-000000000003',
        '192.0.2.66', 'residency.proof', 'f6110000-0000-4000-8000-000000000003');
    perform pg_temp.check_that(result->>'kind' = 'limited' and result->>'operation' = 'proof'
        and (result->>'retry_after_seconds')::integer between 2990 and 3000,
        'Committed proof retry still respects the thirty attempt network limit');
    perform pg_temp.check_that(not exists (select 1 from public.citizen_submission_events
        where scope = 'account' and subject_key = 'f6100000-0000-4000-8000-000000000003')
        and (select count(*) = 30 from public.citizen_submission_events
            where operation = 'proof' and scope = 'network' and subject_key = '192.0.2.66'),
        'Network proof refusal charges no account attempt and no extra network attempt');
end $$;

select pg_temp.check_that((select b.profiles = (select jsonb_agg(to_jsonb(p) order by p.id)
    from public.profiles p where p.id::text like 'f6100000-%') from proof_retry_baseline b),
    'All admissions preserve residency decisions and complete profile snapshots');
select pg_temp.check_that((select b.receipts = (select jsonb_agg(to_jsonb(v) order by v.id)
    from public.residency_proof_versions v where v.id::text like 'f6110000-%') from proof_retry_baseline b),
    'All admissions preserve current and superseded proof receipts');
select pg_temp.check_that((select b.audits = (select count(*) from public.activity_logs)
    from proof_retry_baseline b), 'All admissions add no upload or review audit');
select pg_temp.check_that((select b.notifications = (select count(*) from public.notifications)
    from proof_retry_baseline b), 'All admissions add no notification');
reset role;

select pg_temp.check_that(not has_function_privilege('anon', 'public.admit_citizen_operation(uuid,text,text,uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.admit_citizen_operation(uuid,text,text,uuid)', 'execute'),
    'Browser database roles cannot call proof retry admission');
select count(*) as passed_proof_retry_admission_checks from proof_retry_checks;
rollback;
