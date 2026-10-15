-- #67 an Administrator's name correction keeps the residency decision. Run only
-- against a disposable Postgres database with the repository migrations;
-- kamoti.test_database must be 'disposable'. Every row below is rolled back, and
-- every check is limited to the synthetic accounts, so a seeded database works too.
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

-- a1 admin. c1 verified with a proof, c2 verified without one (the #67 lockout),
-- c3 and c4 verified, c5 awaiting review, c6 rejected.
insert into auth.users (id) select ('d6700000-0000-4000-8000-00000000000' || n)::uuid from generate_series(1, 7) as n;
insert into public.profiles (id, name, first_name, last_name, email, role, barangay, address_line, residency_status) values
    ('d6700000-0000-4000-8000-000000000001', 'Name Admin', 'Name', 'Admin', 'name-admin@kamoti.invalid', 'admin', null, null, null),
    ('d6700000-0000-4000-8000-000000000002', 'Ana Reyes', 'Ana', 'Reyes', 'name-proof@kamoti.invalid', 'citizen', 'Poblacion', '1 Test Street', 'pending'),
    ('d6700000-0000-4000-8000-000000000003', 'Ben Cruz', 'Ben', 'Cruz', 'name-noproof@kamoti.invalid', 'citizen', 'Poblacion', '2 Test Street', 'pending'),
    ('d6700000-0000-4000-8000-000000000004', 'Cara Lim', 'Cara', 'Lim', 'name-self@kamoti.invalid', 'citizen', 'Poblacion', '3 Test Street', 'pending'),
    ('d6700000-0000-4000-8000-000000000005', 'Dan Go', 'Dan', 'Go', 'name-address@kamoti.invalid', 'citizen', 'Poblacion', '4 Test Street', 'pending'),
    ('d6700000-0000-4000-8000-000000000006', 'Eva Tan', 'Eva', 'Tan', 'name-pending@kamoti.invalid', 'citizen', 'Poblacion', '5 Test Street', 'pending'),
    ('d6700000-0000-4000-8000-000000000007', 'Fe Uy', 'Fe', 'Uy', 'name-rejected@kamoti.invalid', 'citizen', 'Poblacion', '6 Test Street', 'pending');
insert into public.residency_proof_versions (id, user_id, object_path) values
    ('e6700000-0000-4000-8000-000000000002', 'd6700000-0000-4000-8000-000000000002', 'test/name-proof.pdf');
update public.profiles set residency_proof_id = 'e6700000-0000-4000-8000-000000000002', residency_proof_path = 'test/name-proof.pdf'
where id = 'd6700000-0000-4000-8000-000000000002';
update public.profiles set residency_status = 'verified', residency_reviewed_by = 'd6700000-0000-4000-8000-000000000001',
    residency_reviewed_at = '2026-10-15T00:00:00Z'
where id in ('d6700000-0000-4000-8000-000000000002', 'd6700000-0000-4000-8000-000000000003',
    'd6700000-0000-4000-8000-000000000004', 'd6700000-0000-4000-8000-000000000005');
update public.profiles set residency_status = 'rejected', residency_note = 'The bill is unreadable.',
    residency_reviewed_by = 'd6700000-0000-4000-8000-000000000001', residency_reviewed_at = '2026-10-15T00:00:00Z'
where id = 'd6700000-0000-4000-8000-000000000007';

create function pg_temp.fix_name(citizen text, body jsonb) returns jsonb language sql as $$
    select public.admin_change_profile('d6700000-0000-4000-8000-000000000001', citizen::uuid, 'user.updated', body)
$$;
create function pg_temp.state(citizen text) returns public.profiles language sql as $$
    select * from public.profiles where id = citizen::uuid
$$;
create function pg_temp.last_update_audit(citizen text) returns jsonb language sql as $$
    select metadata from public.activity_logs where action = 'user.updated' and entity_id = citizen order by id desc limit 1
$$;

\set c1 '''d6700000-0000-4000-8000-000000000002'''
\set c2 '''d6700000-0000-4000-8000-000000000003'''
\set c3 '''d6700000-0000-4000-8000-000000000004'''
\set c4 '''d6700000-0000-4000-8000-000000000005'''
\set c5 '''d6700000-0000-4000-8000-000000000006'''
\set c6 '''d6700000-0000-4000-8000-000000000007'''

-- An Administrator's name correction keeps a verified decision, with or without a proof.
create temporary table before_fix as select * from public.profiles where id = :c1::uuid;
select pg_temp.fix_name(:c1, '{"last_name":"Reyes-Santos","name":"Ana Reyes-Santos"}');
select pg_temp.check_that((select residency_status = 'verified' and residency_reviewed_by = 'd6700000-0000-4000-8000-000000000001'
    and residency_reviewed_at = '2026-10-15T00:00:00Z' and last_name = 'Reyes-Santos' from pg_temp.state(:c1)),
    'an administrator''s name fix keeps a verified decision with a proof');
select pg_temp.check_that((select s.residency_review_version <> b.residency_review_version from pg_temp.state(:c1) s, before_fix b),
    'the name fix still changes the review version');
select pg_temp.check_that(pg_temp.last_update_audit(:c1) ->> 'residency_kept' = 'verified', 'the audit records that the decision was kept');
select pg_temp.fix_name(:c2, '{"first_name":"Benjamin","name":"Benjamin Cruz"}');
select pg_temp.check_that((select residency_status = 'verified' and residency_proof_id is null from pg_temp.state(:c2)),
    'an administrator''s name fix keeps a verified Citizen without a proof verified (#67)');
select pg_temp.check_that(current_setting('kamoti.residency_actor', true) is not distinct from '',
    'the correction mark is cleared after the update');

-- A review opened before the correction is stale.
do $$ declare failed boolean := false; begin
    begin
        perform public.admin_change_profile('d6700000-0000-4000-8000-000000000001', 'd6700000-0000-4000-8000-000000000002',
            'residency.reviewed', jsonb_build_object('decision', 'rejected', 'note', 'The name does not match.',
                'expected_version', (select residency_review_version from before_fix)));
    exception when sqlstate 'PT409' then failed := true; end;
    perform pg_temp.check_that(failed, 'a review of the version before the name fix gets 409');
end $$;

-- The Citizen's own changes still return to review, in the same transaction as the fixes above.
select public.update_own_profile(:c3::uuid, '{"first_name":"Carla","name":"Carla Lim"}');
select pg_temp.check_that((select residency_status = 'pending' and residency_reviewed_by is null from pg_temp.state(:c3)),
    'a Citizen''s own name change returns to review');
select public.update_own_profile(:c4::uuid, '{"address_line":"40 New Street"}');
select pg_temp.check_that((select residency_status = 'pending' from pg_temp.state(:c4)), 'an address change returns to review');

-- Other states are unchanged.
select pg_temp.fix_name(:c5, '{"last_name":"Tan-Lee","name":"Eva Tan-Lee"}');
select pg_temp.check_that((select residency_status = 'pending' from pg_temp.state(:c5)), 'a name fix leaves a Citizen awaiting review waiting');
select pg_temp.check_that(not (pg_temp.last_update_audit(:c5) ? 'residency_kept'), 'no residency_kept for a Citizen awaiting review');
select pg_temp.fix_name(:c6, '{"last_name":"Uy-Ong","name":"Fe Uy-Ong"}');
select pg_temp.check_that((select residency_status = 'rejected' and residency_note = 'The bill is unreadable.' from pg_temp.state(:c6)),
    'a name fix leaves a rejection and its reason');

-- A direct update outside admin_change_profile is not a correction, even right after one.
update public.profiles set last_name = 'Reyes-Cruz', name = 'Ana Reyes-Cruz' where id = :c1::uuid;
select pg_temp.check_that((select residency_status = 'pending' from pg_temp.state(:c1)), 'a later name change outside the function returns to review');

-- A failed audit leaves no correction and no mark.
create function pg_temp.fail_audit() returns trigger language plpgsql as $$
begin raise sqlstate 'ZZ067' using message = 'Deliberately failed audit'; end $$;
create trigger test_name_audit_failure before insert on public.activity_logs for each row execute function pg_temp.fail_audit();
do $$ declare failed boolean := false; begin
    begin
        perform pg_temp.fix_name('d6700000-0000-4000-8000-000000000003', '{"last_name":"Cruz-Diaz","name":"Benjamin Cruz-Diaz"}');
    exception when sqlstate 'ZZ067' then failed := true; end;
    perform pg_temp.check_that(failed and (select last_name = 'Cruz' and residency_status = 'verified' from pg_temp.state('d6700000-0000-4000-8000-000000000003')),
        'an audit failure leaves the name and the decision unchanged');
    perform pg_temp.check_that(current_setting('kamoti.residency_actor', true) is not distinct from '',
        'a failed correction leaves no mark');
end $$;
drop trigger test_name_audit_failure on public.activity_logs;

select count(*) as passed_name_correction_checks from checks;
rollback;
