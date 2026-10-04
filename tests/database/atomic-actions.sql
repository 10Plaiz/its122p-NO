-- Run only against a disposable Postgres database with the repository migrations.
-- The runner must set kamoti.test_database = 'disposable'. All fixture rows and
-- fault-injection triggers below are rolled back. No emails or files are sent.
\set ON_ERROR_STOP on
begin;
do $$ begin
    if current_setting('kamoti.test_database', true) is distinct from 'disposable' then
        raise exception 'Refusing to install test triggers outside the disposable database';
    end if;
end $$;

create temporary table checks (name text primary key);
create function pg_temp.check_that(ok boolean, label text) returns void language plpgsql as $$
begin
    if ok is distinct from true then raise exception 'Check failed: %', label; end if;
    insert into checks values (label);
end $$;
insert into auth.users (id) values
    ('a0000000-0000-4000-8000-000000000001'), ('a0000000-0000-4000-8000-000000000002'),
    ('a0000000-0000-4000-8000-000000000003'), ('a0000000-0000-4000-8000-000000000004');
insert into public.profiles (id, name, email, role, residency_status, residency_proof_path) values
    ('a0000000-0000-4000-8000-000000000001', 'Test Administrator', 'atomic-admin@kamoti.invalid', 'admin', null, null),
    ('a0000000-0000-4000-8000-000000000002', 'Test Staff', 'atomic-staff@kamoti.invalid', 'staff', null, null),
    ('a0000000-0000-4000-8000-000000000003', 'Test Citizen', 'atomic-citizen@kamoti.invalid', 'citizen', 'pending', 'test/proof.pdf');
insert into public.reports (id, citizen_id, assigned_staff_id, category_id, title, description, latitude, longitude, status, is_public)
select 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000002', min(id), '[TEST] Atomic closure', 'Synthetic transaction test.', 14.555, 121.025, 'in_progress', true
from public.categories;
insert into public.report_photos (report_id, uploaded_by, kind, storage_path) values
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'resolution', 'test/repair.png');
create temporary table request_versions (version timestamptz);

create function pg_temp.fail_write() returns trigger language plpgsql as $$
begin raise sqlstate 'ZZ001' using message = 'Deliberately failed required record'; end $$;
create trigger test_history_failure before insert on public.report_updates for each row execute function pg_temp.fail_write();
do $$ declare failed boolean := false; begin
    begin perform public.request_report_closure('b0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000002', 'resolved', 'Repair completed.');
    exception when sqlstate 'ZZ001' then failed := true; end;
    perform pg_temp.check_that(failed, 'request propagates history failure');
    perform pg_temp.check_that((select closure_requested_at is null from public.reports where id = 'b0000000-0000-4000-8000-000000000001'),
        'failed request leaves no pending closure');
end $$;
drop trigger test_history_failure on public.report_updates;
select public.request_report_closure('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'resolved', 'Repair completed.');
insert into request_versions select closure_requested_at from public.reports where id = 'b0000000-0000-4000-8000-000000000001';
select pg_temp.check_that((select count(*) = 1 from public.report_updates), 'request retains history');
select pg_temp.check_that((select count(*) = 1 from public.activity_logs), 'request retains audit');
select pg_temp.check_that((select count(*) = 2 from public.notifications), 'request notifies citizen and administrator');

create trigger test_history_failure before insert on public.report_updates for each row execute function pg_temp.fail_write();
do $$ declare failed boolean := false; begin
    begin perform public.review_report_closure('b0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', (select version from request_versions), 'approve', 'Confirmed.');
    exception when sqlstate 'ZZ001' then failed := true; end;
    perform pg_temp.check_that(failed, 'approval propagates history failure');
    perform pg_temp.check_that((select status = 'in_progress' and verified_at is null from public.reports where id = 'b0000000-0000-4000-8000-000000000001'),
        'history failure rolls back terminal status');
    perform pg_temp.check_that((select count(*) = 1 from public.activity_logs), 'history failure adds no approval audit');
end $$;
drop trigger test_history_failure on public.report_updates;

create trigger test_audit_failure before insert on public.activity_logs for each row execute function pg_temp.fail_write();
do $$ declare failed boolean := false; begin
    begin perform public.review_report_closure('b0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', (select version from request_versions), 'approve', 'Confirmed.');
    exception when sqlstate 'ZZ001' then failed := true; end;
    perform pg_temp.check_that(failed, 'approval propagates audit failure');
    perform pg_temp.check_that((select status = 'in_progress' and verified_at is null from public.reports where id = 'b0000000-0000-4000-8000-000000000001'),
        'audit failure rolls back terminal status');
    perform pg_temp.check_that((select count(*) = 1 from public.report_updates), 'audit failure rolls back approval history');
    perform pg_temp.check_that((select count(*) = 2 from public.notifications), 'audit failure rolls back approval notices');
    failed := false;
    begin perform public.admin_change_profile('a0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000003', 'user.updated', '{"role":"admin"}');
    exception when sqlstate 'ZZ001' then failed := true; end;
    perform pg_temp.check_that(failed, 'account change propagates audit failure');
    perform pg_temp.check_that((select role = 'citizen' from public.profiles where id = 'a0000000-0000-4000-8000-000000000003'),
        'audit failure rolls back role change');
    failed := false;
    begin perform public.admin_create_profile('a0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000004', '{"name":"Test New Administrator","email":"atomic-new@kamoti.invalid","role":"admin"}');
    exception when sqlstate 'ZZ001' then failed := true; end;
    perform pg_temp.check_that(failed, 'account creation propagates audit failure');
    perform pg_temp.check_that(not exists(select 1 from public.profiles where id = 'a0000000-0000-4000-8000-000000000004'),
        'audit failure leaves no privileged profile');
end $$;
drop trigger test_audit_failure on public.activity_logs;

update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000002';
do $$ declare refused boolean := false; begin
    begin perform public.review_report_closure('b0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000002', (select version from request_versions), 'approve', 'Confirmed.');
    exception when sqlstate 'PT403' then refused := true; end;
    perform pg_temp.check_that(refused, 'promoted requester cannot approve own request');
end $$;
update public.profiles set role = 'staff' where id = 'a0000000-0000-4000-8000-000000000002';
select public.review_report_closure('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
    (select version from request_versions), 'return', 'Need further work.');
select pg_temp.check_that((select closure_requested_at is null and status = 'in_progress' from public.reports where id = 'b0000000-0000-4000-8000-000000000001'),
    'return clears request and keeps status');
select public.request_report_closure('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'rejected', 'Outside repair scope.');
do $$ declare refused boolean := false; begin
    begin perform public.review_report_closure('b0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', (select version from request_versions), 'approve', 'Confirmed.');
    exception when sqlstate 'PT409' then refused := true; end;
    perform pg_temp.check_that(refused, 'stale approval cannot close a replacement request');
    perform pg_temp.check_that((select closure_outcome = 'rejected' and status = 'in_progress' from public.reports where id = 'b0000000-0000-4000-8000-000000000001'),
        'replacement request remains unchanged');
end $$;
select public.review_report_closure('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
    (select closure_requested_at from public.reports where id = 'b0000000-0000-4000-8000-000000000001'), 'approve', 'Confirmed outside scope.');
select pg_temp.check_that((select status = 'rejected' and resolved_at is null and verified_at is not null from public.reports
    where id = 'b0000000-0000-4000-8000-000000000001'), 'rejection closes with verification and no resolved date');
select pg_temp.check_that((select count(*) = 1 from public.report_updates where update_type = 'verification' and new_status = 'rejected'),
    'approved rejection retains one transition');
select pg_temp.check_that((select count(*) = 1 from public.activity_logs where action = 'report.closure_approved'),
    'approved rejection retains one audit');
select public.admin_change_profile('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'residency.reviewed',
    '{"decision":"rejected","note":"Please upload a readable proof."}');
select pg_temp.check_that((select residency_status = 'rejected' and residency_reviewed_by = 'a0000000-0000-4000-8000-000000000001'
    from public.profiles where id = 'a0000000-0000-4000-8000-000000000003'), 'residency decision retains reviewer');
select pg_temp.check_that((select count(*) = 1 from public.activity_logs where action = 'residency.reviewed'), 'residency decision retains audit');
select pg_temp.check_that(not has_function_privilege('anon', 'public.review_report_closure(uuid,uuid,timestamptz,text,text,inet)', 'execute'),
    'anonymous clients cannot invoke closure write');
select pg_temp.check_that(not has_function_privilege('authenticated', 'public.admin_change_profile(uuid,uuid,text,jsonb,inet)', 'execute'),
    'user tokens cannot invoke privileged profile write');
select pg_temp.check_that(has_function_privilege('service_role', 'public.admin_change_profile(uuid,uuid,text,jsonb,inet)', 'execute'),
    'server role can invoke profile write');
select count(*) as passed_database_checks from checks;
rollback;
