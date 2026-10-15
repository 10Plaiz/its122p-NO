-- #70 residency proof files are kept 30 days after they stop being current. Run
-- only against a disposable Postgres database with the repository migrations;
-- kamoti.test_database must be 'disposable'. Every row below is rolled back, and
-- every check is limited to the synthetic paths, so a seeded database works too.
\set ON_ERROR_STOP on
begin;
do $$ begin
    if current_setting('kamoti.test_database', true) is distinct from 'disposable' then
        raise exception 'Refusing to run outside the disposable database';
    end if;
end $$;

create temporary table checks (name text primary key);
create function pg_temp.check_that(ok boolean, label text) returns void language plpgsql as $$
begin
    if ok is distinct from true then raise exception 'Check failed: %', label; end if;
    insert into checks values (label);
end $$;
create function pg_temp.fails_with(statement text, state text) returns boolean language plpgsql as $$
begin
    execute statement;
    return false;
exception when others then
    return sqlstate = state;
end $$;

-- c1 has a current proof and three earlier ones; c2's current proof was marked
-- superseded long ago (defensive case).
insert into auth.users (id) values ('d7000000-0000-4000-8000-000000000001'), ('d7000000-0000-4000-8000-000000000002');
insert into public.profiles (id, name, email, role, residency_status) values
    ('d7000000-0000-4000-8000-000000000001', 'Retention Citizen', 'retention-1@kamoti.invalid', 'citizen', 'pending'),
    ('d7000000-0000-4000-8000-000000000002', 'Retention Current', 'retention-2@kamoti.invalid', 'citizen', 'pending');
insert into public.residency_proof_versions (id, user_id, object_path, created_at, superseded_at, file_removed_at) values
    ('e7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'retention-test/expired.pdf',
        clock_timestamp() - interval '60 days', clock_timestamp() - interval '40 days', null),
    ('e7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000001', 'retention-test/recent.pdf',
        clock_timestamp() - interval '20 days', clock_timestamp() - interval '10 days', null),
    ('e7000000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-000000000001', 'retention-test/removed.pdf',
        clock_timestamp() - interval '90 days', clock_timestamp() - interval '80 days', clock_timestamp() - interval '45 days'),
    ('e7000000-0000-4000-8000-000000000004', 'd7000000-0000-4000-8000-000000000001', 'retention-test/current.pdf',
        clock_timestamp() - interval '5 days', null, null),
    ('e7000000-0000-4000-8000-000000000005', 'd7000000-0000-4000-8000-000000000002', 'retention-test/current-old.pdf',
        clock_timestamp() - interval '60 days', clock_timestamp() - interval '40 days', null),
    ('e7000000-0000-4000-8000-000000000006', 'd7000000-0000-4000-8000-000000000002', 'retention-test/never-replaced.pdf',
        clock_timestamp() - interval '60 days', null, null);
update public.profiles set residency_proof_id = 'e7000000-0000-4000-8000-000000000004', residency_proof_path = 'retention-test/current.pdf'
where id = 'd7000000-0000-4000-8000-000000000001';
update public.profiles set residency_proof_id = 'e7000000-0000-4000-8000-000000000005', residency_proof_path = 'retention-test/current-old.pdf'
where id = 'd7000000-0000-4000-8000-000000000002';
insert into storage.objects (bucket_id, name, created_at) values
    ('residency-proofs', 'retention-test/expired.pdf', clock_timestamp() - interval '60 days'),
    ('residency-proofs', 'retention-test/unattached-old.pdf', clock_timestamp() - interval '31 days'),
    ('residency-proofs', 'retention-test/unattached-new.pdf', clock_timestamp() - interval '2 days'),
    ('report-photos', 'retention-test/other-bucket.png', clock_timestamp() - interval '60 days');

create temporary view listed as
select kind, version_id, object_path from public.expired_residency_proof_files(1000000) where object_path like 'retention-test/%';

-- What is listed.
select pg_temp.check_that((select count(*) = 1 from listed where kind = 'replaced' and version_id = 'e7000000-0000-4000-8000-000000000001'),
    'a proof replaced more than 30 days ago is listed');
select pg_temp.check_that(not exists (select 1 from listed where object_path = 'retention-test/recent.pdf'), 'a proof replaced 10 days ago is kept');
select pg_temp.check_that(not exists (select 1 from listed where object_path = 'retention-test/removed.pdf'), 'a file already removed is not listed again');
select pg_temp.check_that(not exists (select 1 from listed where object_path like 'retention-test/current%'), 'a current proof is never listed, even if marked superseded');
select pg_temp.check_that((select count(*) = 1 from listed where kind = 'unattached' and version_id is null and object_path = 'retention-test/unattached-old.pdf'),
    'an upload that never reached an account is listed after 30 days');
select pg_temp.check_that(not exists (select 1 from listed where object_path = 'retention-test/unattached-new.pdf'), 'a recent unattached upload is kept');
select pg_temp.check_that((select count(*) = 1 from listed where object_path = 'retention-test/expired.pdf'), 'an attached file is never listed as unattached');
select pg_temp.check_that(not exists (select 1 from listed where object_path = 'retention-test/other-bucket.png'), 'other buckets are ignored');
select pg_temp.check_that((select count(*) = 0 from public.expired_residency_proof_files(0)), 'the limit is respected');

-- Recording a removal, in database time; a second call records nothing.
select pg_temp.check_that(public.record_residency_proof_files_removed(array['e7000000-0000-4000-8000-000000000001'::uuid]) = 1,
    'the recording function records a listed proof');
select pg_temp.check_that(public.record_residency_proof_files_removed(array['e7000000-0000-4000-8000-000000000001'::uuid]) = 0,
    'recording again changes nothing');
select pg_temp.check_that(pg_temp.fails_with($$select public.record_residency_proof_files_removed(array['e7000000-0000-4000-8000-000000000004'::uuid])$$, 'PT400'),
    'the recording function refuses an account''s current proof');
select pg_temp.check_that(not exists (select 1 from listed where object_path = 'retention-test/expired.pdf'), 'a recorded file is not listed on the next run');

-- A file the cleanup may list can never be attached: attaching stops at 29 days.
insert into auth.users (id) values ('d7000000-0000-4000-8000-000000000003');
insert into public.profiles (id, name, email, role, residency_status) values
    ('d7000000-0000-4000-8000-000000000003', 'Retention Uploader', 'retention-3@kamoti.invalid', 'citizen', null);
insert into storage.objects (bucket_id, name, created_at) values
    ('residency-proofs', 'd7000000-0000-4000-8000-000000000003/e7000000-0000-4000-8000-000000000010.pdf', clock_timestamp() - interval '30 days'),
    ('residency-proofs', 'd7000000-0000-4000-8000-000000000003/e7000000-0000-4000-8000-000000000011.pdf', clock_timestamp() - interval '1 hour');
select pg_temp.check_that(pg_temp.fails_with(format('select public.complete_residency_proof(%L, %L, %L, %L, %L)',
    'd7000000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-000000000010',
    'd7000000-0000-4000-8000-000000000003/e7000000-0000-4000-8000-000000000010.pdf', repeat('a', 64),
    (select residency_review_version from public.profiles where id = 'd7000000-0000-4000-8000-000000000003')), 'PT409'),
    'an upload stored 30 days ago cannot be attached');
select pg_temp.check_that((select residency_proof_id is null from public.profiles where id = 'd7000000-0000-4000-8000-000000000003'),
    'the refused attachment changes nothing');
select public.complete_residency_proof('d7000000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-000000000011',
    'd7000000-0000-4000-8000-000000000003/e7000000-0000-4000-8000-000000000011.pdf', repeat('b', 64),
    (select residency_review_version from public.profiles where id = 'd7000000-0000-4000-8000-000000000003'));
select pg_temp.check_that((select residency_proof_id = 'e7000000-0000-4000-8000-000000000011' from public.profiles
    where id = 'd7000000-0000-4000-8000-000000000003'), 'a recent upload still attaches');
select pg_temp.check_that(pg_temp.fails_with($$update public.residency_proof_versions set file_removed_at = clock_timestamp()
    where id = 'e7000000-0000-4000-8000-000000000001'$$, 'PT400'), 'a removal is recorded only once');
select pg_temp.check_that(pg_temp.fails_with($$update public.residency_proof_versions set file_removed_at = clock_timestamp()
    where id = 'e7000000-0000-4000-8000-000000000002'$$, '23514'), 'a file cannot be recorded removed within 30 days');
select pg_temp.check_that(pg_temp.fails_with($$update public.residency_proof_versions set file_removed_at = clock_timestamp()
    where id = 'e7000000-0000-4000-8000-000000000006'$$, '23514'), 'a proof that was never replaced cannot be recorded removed');
select pg_temp.check_that(pg_temp.fails_with($$update public.residency_proof_versions set file_removed_at = clock_timestamp()
    where id = 'e7000000-0000-4000-8000-000000000004'$$, 'PT400'), 'an account''s current proof cannot be recorded removed');
select pg_temp.check_that(pg_temp.fails_with($$update public.residency_proof_versions set file_removed_at = clock_timestamp()
    where id = 'e7000000-0000-4000-8000-000000000005'$$, 'PT400'), 'a current proof marked superseded long ago still cannot be recorded removed');
select pg_temp.check_that(pg_temp.fails_with($$update public.residency_proof_versions set object_path = 'retention-test/moved.pdf'
    where id = 'e7000000-0000-4000-8000-000000000001'$$, 'PT400'), 'the identity of a removed proof stays fixed');
select pg_temp.check_that(pg_temp.fails_with($$delete from public.residency_proof_versions
    where id = 'e7000000-0000-4000-8000-000000000001'$$, 'PT400'), 'a removed proof keeps its row');

-- Access.
select pg_temp.check_that(not has_function_privilege('authenticated', 'public.expired_residency_proof_files(integer)', 'execute')
    and not has_function_privilege('anon', 'public.expired_residency_proof_files(integer)', 'execute'), 'client roles cannot list expired files');
select pg_temp.check_that(not has_function_privilege('authenticated', 'public.record_residency_proof_files_removed(uuid[])', 'execute'),
    'client roles cannot record removals');
select pg_temp.check_that(has_function_privilege('service_role', 'public.expired_residency_proof_files(integer)', 'execute')
    and has_function_privilege('service_role', 'public.record_residency_proof_files_removed(uuid[])', 'execute'), 'the API role can list and record');
select pg_temp.check_that(not has_column_privilege('service_role', 'public.residency_proof_versions', 'object_path', 'update'),
    'the API role still cannot rewrite a proof path');

select count(*) as passed_proof_retention_checks from checks;
rollback;
