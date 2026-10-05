\set ON_ERROR_STOP on
begin;
do $$ begin
    if current_setting('kamoti.test_database', true) is distinct from 'disposable' then
        raise exception 'Refusing citizen limit tests outside the disposable database';
    end if;
end $$;
delete from public.citizen_submission_events;

create temporary table submission_checks (name text primary key);
grant select, insert on submission_checks to service_role;
create function pg_temp.check_that(ok boolean, label text) returns void language plpgsql as $$
begin
    if ok is distinct from true then raise exception 'Check failed: %', label; end if;
    insert into submission_checks values (label);
end $$;

insert into auth.users (id) values
    ('c0000000-0000-4000-8000-000000000001'), ('c0000000-0000-4000-8000-000000000002'),
    ('c0000000-0000-4000-8000-000000000003'), ('c0000000-0000-4000-8000-000000000004');
insert into public.profiles (id, name, email, role, residency_status, residency_proof_path) values
    ('c0000000-0000-4000-8000-000000000001', 'Limit Citizen', 'limit-one@kamoti.invalid', 'citizen', 'pending', 'test/proof.pdf'),
    ('c0000000-0000-4000-8000-000000000002', 'Other Citizen', 'limit-two@kamoti.invalid', 'citizen', 'verified', null),
    ('c0000000-0000-4000-8000-000000000003', 'No Proof Citizen', 'limit-three@kamoti.invalid', 'citizen', 'pending', null),
    ('c0000000-0000-4000-8000-000000000004', 'Limit Staff', 'limit-staff@kamoti.invalid', 'staff', null, null);

do $$ declare client_role text; begin
    foreach client_role in array array['anon', 'authenticated'] loop
        perform pg_temp.check_that(not has_table_privilege(client_role, 'public.citizen_submission_events', 'SELECT,INSERT,UPDATE,DELETE')
            and not has_any_column_privilege(client_role, 'public.citizen_submission_events', 'SELECT,INSERT,UPDATE'), client_role || ' cannot access ledger');
        perform pg_temp.check_that(not has_function_privilege(client_role, 'public.admit_citizen_operation(uuid,text,text)', 'execute'), client_role || ' cannot reserve attempts');
        perform pg_temp.check_that(not has_function_privilege(client_role, 'public.purge_citizen_submission_events()', 'execute'), client_role || ' cannot purge attempts');
    end loop;
    perform pg_temp.check_that((select relrowsecurity from pg_class where oid = 'public.citizen_submission_events'::regclass), 'ledger has RLS');
end $$;

set local role service_role;
do $$ declare result jsonb; refused boolean; begin
    for i in 1..5 loop
        result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000001', '192.0.2.1', 'report.create.json');
        perform pg_temp.check_that(result = '{"kind":"allowed"}'::jsonb, 'report account attempt ' || i || ' allowed');
    end loop;
    result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000001', '192.0.2.2', 'report.create.multipart');
    perform pg_temp.check_that(result->>'kind' = 'limited' and result->>'operation' = 'report'
        and (result->>'retry_after_seconds')::integer between 3598 and 3600, 'sixth report refused across networks with retry metadata');
    perform pg_temp.check_that((select count(*) = 10 from public.citizen_submission_events), 'refused report bundle charges no photo or network');
    result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000002', '192.0.2.1', 'report.create.multipart');
    perform pg_temp.check_that(result->>'kind' = 'allowed', 'verified citizen without proof can submit independently');
    perform pg_temp.check_that((select count(*) = 14 from public.citizen_submission_events), 'multipart admission reserves all four scopes');
    for i in 1..3 loop
        result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000003', '192.0.2.3', 'residency.proof');
        perform pg_temp.check_that(result->>'kind' = 'allowed', 'proof attempt ' || i || ' does not need existing proof');
    end loop;
    result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000003', '192.0.2.4', 'residency.proof');
    perform pg_temp.check_that(result->>'kind' = 'limited' and result->>'operation' = 'proof', 'fourth proof refused across networks');
    refused := false;
    begin perform public.admit_citizen_operation('c0000000-0000-4000-8000-000000000003', '192.0.2.3', 'report.create.json');
    exception when sqlstate 'PT403' then refused := true; end;
    perform pg_temp.check_that(refused, 'citizen without proof cannot report');
    refused := false;
    begin perform public.admit_citizen_operation('c0000000-0000-4000-8000-000000000002', '192.0.2.3', 'residency.proof');
    exception when sqlstate 'PT400' then refused := true; end;
    perform pg_temp.check_that(refused, 'verified residency cannot upload again');
    refused := false;
    begin perform public.admit_citizen_operation('c0000000-0000-4000-8000-000000000004', '192.0.2.3', 'report.photo');
    exception when sqlstate 'PT403' then refused := true; end;
    perform pg_temp.check_that(refused, 'RPC does not reserve for staff');
end $$;
reset role;

delete from public.citizen_submission_events;
insert into public.citizen_submission_events (operation, scope, subject_key, admitted_at, expires_at)
select 'photo', 'network', '192.0.2.10', now() - interval '10 minutes', now() + interval '50 minutes' from generate_series(1,150);
set local role service_role;
do $$ declare result jsonb; begin
    result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000001', '192.0.2.10', 'report.create.multipart');
    perform pg_temp.check_that(result->>'kind' = 'limited' and result->>'operation' = 'photo', 'network photo exhaustion refuses whole report bundle');
    perform pg_temp.check_that((select count(*) = 150 from public.citizen_submission_events), 'network refusal spends no account or report scopes');
    result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000001', '192.0.2.10', 'report.create.json');
    perform pg_temp.check_that(result->>'kind' = 'allowed', 'JSON report does not spend photo allowance');
    result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000002', '192.0.2.10', 'report.photo');
    perform pg_temp.check_that(result->>'kind' = 'limited', 'shared network refuses another account');
end $$;
reset role;

delete from public.citizen_submission_events;
insert into public.citizen_submission_events (operation, scope, subject_key, admitted_at, expires_at)
select 'proof', 'network', '192.0.2.30', deadline - interval '3600 seconds', deadline
from generate_series(1,26), (select clock_timestamp() + interval '50 minutes' as deadline) timing;
set local role service_role;
do $$ declare result jsonb; begin
    for i in 1..3 loop
        result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000001', '192.0.2.30', 'residency.proof');
        perform pg_temp.check_that(result = '{"kind":"allowed"}'::jsonb, 'first citizen proof attempt ' || i || ' allowed on shared network');
    end loop;
    result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000003', '192.0.2.30', 'residency.proof');
    perform pg_temp.check_that(result = '{"kind":"allowed"}'::jsonb, 'second citizen retains own proof allowance before shared network fills');
    result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000003', '192.0.2.30', 'residency.proof');
    perform pg_temp.check_that(result->>'kind' = 'limited' and result->>'operation' = 'proof', 'thirty-first network proof refused with spare account allowance');
    perform pg_temp.check_that((select count(*) = 30 from public.citizen_submission_events where operation = 'proof' and scope = 'network' and subject_key = '192.0.2.30')
        and (select count(*) = 1 from public.citizen_submission_events where operation = 'proof' and scope = 'account' and subject_key = 'c0000000-0000-4000-8000-000000000003'),
        'network proof refusal does not spend second citizen allowance');
end $$;
reset role;

delete from public.citizen_submission_events;
insert into public.citizen_submission_events (operation, scope, subject_key, admitted_at, expires_at)
select 'report', 'account', 'c0000000-0000-4000-8000-000000000001', deadline - interval '3600 seconds', deadline
from generate_series(1,5), (select clock_timestamp() + interval '10 minutes' as deadline) timing;
insert into public.citizen_submission_events (operation, scope, subject_key, admitted_at, expires_at)
select 'photo', 'network', '192.0.2.31', deadline - interval '3600 seconds', deadline
from generate_series(1,150), (select clock_timestamp() + interval '20 minutes' as deadline) timing;
set local role service_role;
do $$ declare result jsonb; begin
    result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000001', '192.0.2.31', 'report.create.multipart');
    perform pg_temp.check_that(result->>'kind' = 'limited' and result->>'operation' = 'photo'
        and (result->>'retry_after_seconds')::integer between 1198 and 1200,
        'multipart retry waits for later network photo expiry, beyond account report expiry');
    perform pg_temp.check_that((select count(*) = 155 from public.citizen_submission_events),
        'simultaneous exhausted scopes refuse multipart without partial spending');
end $$;
reset role;

delete from public.citizen_submission_events;
insert into public.citizen_submission_events (operation, scope, subject_key, admitted_at, expires_at)
select 'report', 'account', 'c0000000-0000-4000-8000-000000000001', now() - interval '3600 seconds', now() from generate_series(1,5);
set local role service_role;
select pg_temp.check_that(public.admit_citizen_operation('c0000000-0000-4000-8000-000000000001', '192.0.2.20', 'report.create.json')->>'kind' = 'allowed', 'expired trailing-hour events permit recovery');
reset role;

delete from public.citizen_submission_events;
insert into public.citizen_submission_events (operation, scope, subject_key, admitted_at, expires_at) values
    ('report', 'account', 'c0000000-0000-4000-8000-000000000001', now() - interval '50 minutes', now() + interval '10 minutes'),
    ('report', 'account', 'c0000000-0000-4000-8000-000000000001', now() - interval '45 minutes', now() + interval '15 minutes'),
    ('report', 'account', 'c0000000-0000-4000-8000-000000000001', now() - interval '40 minutes', now() + interval '20 minutes');
insert into public.citizen_submission_events (operation, scope, subject_key, admitted_at, expires_at)
select 'report', 'account', 'c0000000-0000-4000-8000-000000000001', now() - interval '30 minutes', now() + interval '30 minutes' from generate_series(1,4);
set local role service_role;
do $$ declare result jsonb; begin
    result := public.admit_citizen_operation('c0000000-0000-4000-8000-000000000001', '192.0.2.21', 'report.create.json');
    perform pg_temp.check_that((result->>'retry_after_seconds')::integer between 1198 and 1200, 'over-cap usage waits for third expiry rather than first');
end $$;
reset role;

insert into public.citizen_submission_events (operation, scope, subject_key, admitted_at, expires_at)
select 'proof', 'network', '192.0.2.99', now() - interval '2 hours', now() - interval '1 hour' from generate_series(1,300);
set local role service_role;
select pg_temp.check_that(public.purge_citizen_submission_events() = 256, 'cleanup is bounded to 256 events');
select pg_temp.check_that((select count(*) = 7 from public.citizen_submission_events where expires_at > clock_timestamp()), 'cleanup preserves live attempts');
select pg_temp.check_that(public.purge_citizen_submission_events() = 44, 'cleanup can finish remaining expired events');
reset role;

update public.profiles set is_active = false where id = 'c0000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ declare refused boolean := false; begin
    begin perform public.admit_citizen_operation('c0000000-0000-4000-8000-000000000001', '192.0.2.1', 'report.photo');
    exception when sqlstate 'PT403' then refused := true; end;
    perform pg_temp.check_that(refused, 'current deactivation prevents admission');
end $$;
reset role;
select count(*) as passed_citizen_submission_checks from submission_checks;
rollback;
