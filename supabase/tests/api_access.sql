-- Run as the database owner on a disposable database after all migrations.
-- No extensions or test framework required; failed assertions raise errors.
begin;

-- Check effective privileges, including any grants inherited from PUBLIC.
do $test$
declare
    client_role text;
    relation_name text;
begin
    foreach client_role in array array['anon', 'authenticated'] loop
        foreach relation_name in array array[
            'profiles', 'reports', 'report_photos', 'report_updates',
            'notifications', 'activity_logs', 'report_inspections'
        ] loop
            if has_table_privilege(client_role, 'public.' || relation_name,
                                   'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
               or has_any_column_privilege(client_role, 'public.' || relation_name,
                                           'SELECT,INSERT,UPDATE,REFERENCES') then
                raise exception '% can access protected table %', client_role, relation_name;
            end if;
        end loop;

        foreach relation_name in array array['categories', 'public_reports'] loop
            if not has_table_privilege(client_role, 'public.' || relation_name, 'SELECT')
               or has_table_privilege(client_role, 'public.' || relation_name,
                                      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
                raise exception '% must have read-only access to %', client_role, relation_name;
            end if;
        end loop;
    end loop;
end;
$test$;

insert into auth.users (id, email) values
    ('70000000-0000-4000-8000-000000000001', 'access-citizen@example.invalid'),
    ('70000000-0000-4000-8000-000000000002', 'access-staff@example.invalid');

-- The backend must retain permission to create profiles and reports.
set local role service_role;
insert into public.profiles (id, name, email, role, is_active) values
    ('70000000-0000-4000-8000-000000000001', 'Access Citizen', 'access-citizen@example.invalid', 'citizen', false),
    ('70000000-0000-4000-8000-000000000002', 'Access Staff', 'access-staff@example.invalid', 'staff', true);

insert into public.reports (id, citizen_id, category_id, title, description, latitude, longitude)
values ('70000000-0000-4000-8000-000000000003',
        '70000000-0000-4000-8000-000000000001',
        (select id from public.categories where name = 'Road'),
        'Permission test', 'Synthetic infrastructure report.', 14.5, 121.0);

insert into public.reports (id, citizen_id, category_id, title, description, latitude, longitude)
values ('70000000-0000-4000-8000-000000000004',
        '70000000-0000-4000-8000-000000000001',
        (select id from public.categories where name = 'Road'),
        'Pending permission test', 'Synthetic private report.', 14.5, 121.0);

update public.reports
set assigned_staff_id = '70000000-0000-4000-8000-000000000002',
    status = 'under_review', is_public = true
where id = '70000000-0000-4000-8000-000000000003';

insert into public.report_updates (report_id, updated_by, update_type, previous_status, new_status)
values ('70000000-0000-4000-8000-000000000003',
        '70000000-0000-4000-8000-000000000002', 'status_change', 'pending', 'under_review');

insert into public.report_inspections (report_id, inspector_id, severity, findings)
values ('70000000-0000-4000-8000-000000000003',
        '70000000-0000-4000-8000-000000000002',
        'high', 'Road surface requires repair.');

insert into public.notifications (user_id, report_id, message)
values ('70000000-0000-4000-8000-000000000001',
        '70000000-0000-4000-8000-000000000003', 'Your report is under review.');
reset role;

-- SECURITY INVOKER (the default) ensures the attempted SQL uses the caller role.
create function pg_temp.expect_denied(statement text) returns void
language plpgsql as $test$
begin
    begin
        execute statement;
    exception when insufficient_privilege then
        return;
    end;
    raise exception 'Expected permission denied: %', statement;
end;
$test$;

set local role anon;
select pg_temp.expect_denied('select citizen_id, assigned_staff_id from public.reports');
select pg_temp.expect_denied('select uploaded_by from public.report_photos');
select pg_temp.expect_denied('select findings from public.report_inspections');

do $test$
declare
    public_row jsonb;
begin
    perform id from public.categories;
    select to_jsonb(r) into public_row from public.public_reports r
    where id = '70000000-0000-4000-8000-000000000003';
    if public_row is null or public_row ?| array['citizen_id', 'assigned_staff_id', 'email'] then
        raise exception 'Public board must expose a reviewed report without internal user fields';
    end if;
    if exists (select 1 from public.public_reports
               where id = '70000000-0000-4000-8000-000000000004') then
        raise exception 'Pending report leaked onto public board';
    end if;
end;
$test$;
reset role;

-- Set both supported JWT claim formats for auth.uid() in local/Supabase tests.
set local request.jwt.claim.sub = '70000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select pg_temp.expect_denied('update public.profiles set is_active = true where id = auth.uid()');
select pg_temp.expect_denied('select citizen_id, assigned_staff_id from public.reports');
reset role;

-- Even an active citizen must use the API to create and process a report.
update public.profiles set is_active = true where id = '70000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.expect_denied($attack$
    insert into public.reports
        (citizen_id, category_id, assigned_staff_id, title, description,
         latitude, longitude, status, is_public)
    values (auth.uid(), (select id from public.categories where name = 'Road'),
            '70000000-0000-4000-8000-000000000002', 'Forged review',
            'Citizen skipped the review process.', 14.5, 121.0, 'under_review', true)
$attack$);
select pg_temp.expect_denied($attack$
    update public.notifications set message = 'Rewritten' where user_id = auth.uid()
$attack$);
reset role;

-- A staff JWT also cannot bypass the API's status/history/notification checks.
set local request.jwt.claim.sub = '70000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select pg_temp.expect_denied($attack$
    update public.reports set status = 'resolved', resolved_at = now()
    where id = '70000000-0000-4000-8000-000000000003'
$attack$);
reset role;

rollback;
