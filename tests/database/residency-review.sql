-- #63 residency decisions record their basis. Run only against a disposable
-- Postgres database with the repository migrations; kamoti.test_database must be
-- 'disposable'. Every row below is rolled back, and every count is limited to the
-- synthetic accounts, so a seeded database works too.
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

-- d1 admin, d2 staff, d3 citizen with a proof, d4 citizen without one.
insert into auth.users (id) values
    ('d0000000-0000-4000-8000-000000000001'), ('d0000000-0000-4000-8000-000000000002'),
    ('d0000000-0000-4000-8000-000000000003'), ('d0000000-0000-4000-8000-000000000004');
insert into public.profiles (id, name, email, role, residency_status) values
    ('d0000000-0000-4000-8000-000000000001', 'Review Administrator', 'review-admin@kamoti.invalid', 'admin', null),
    ('d0000000-0000-4000-8000-000000000002', 'Review Staff', 'review-staff@kamoti.invalid', 'staff', null),
    ('d0000000-0000-4000-8000-000000000003', 'Review Citizen', 'review-citizen@kamoti.invalid', 'citizen', 'pending'),
    ('d0000000-0000-4000-8000-000000000004', 'Review Walk-in', 'review-walkin@kamoti.invalid', 'citizen', 'pending');
insert into public.residency_proof_versions (id, user_id, object_path) values
    ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'test/review-proof.pdf');
update public.profiles set residency_proof_id = 'e0000000-0000-4000-8000-000000000001', residency_proof_path = 'test/review-proof.pdf'
where id = 'd0000000-0000-4000-8000-000000000003';

-- Calls the review as d1 (or another actor) with the citizen's current version.
create function pg_temp.review(citizen text, body jsonb, actor text default 'd0000000-0000-4000-8000-000000000001')
returns jsonb language sql as $$
    select public.admin_change_profile(actor::uuid, citizen::uuid, 'residency.reviewed',
        body || jsonb_build_object('expected_version',
            (select residency_review_version from public.profiles where id = citizen::uuid)))
$$;
-- True when the review is refused with the given SQLSTATE and changes nothing.
create function pg_temp.refused(citizen text, body jsonb, state text, actor text default 'd0000000-0000-4000-8000-000000000001')
returns boolean language plpgsql as $$
declare before_status text;
begin
    select residency_status into before_status from public.profiles where id = citizen::uuid;
    begin
        perform pg_temp.review(citizen, body, actor);
    exception when others then
        return sqlstate = state and (select residency_status from public.profiles where id = citizen::uuid) is not distinct from before_status;
    end;
    return false;
end $$;
create function pg_temp.audits(citizen text) returns bigint language sql as $$
    select count(*) from public.activity_logs where action = 'residency.reviewed' and entity_id = citizen
$$;
create function pg_temp.last_audit(citizen text) returns jsonb language sql as $$
    select metadata from public.activity_logs where action = 'residency.reviewed' and entity_id = citizen order by id desc limit 1
$$;

\set c3 '''d0000000-0000-4000-8000-000000000003'''
\set c4 '''d0000000-0000-4000-8000-000000000004'''
\set all_checks '''["name","address","readable","document"]'''

-- An approval must name its basis.
select pg_temp.check_that(pg_temp.refused(:c3, '{"decision":"verified"}', 'PT400'), 'an approval without a method is refused');
select pg_temp.check_that(pg_temp.refused(:c3, '{"decision":"verified","method":"trust"}', 'PT400'), 'an unknown method is refused');

-- The document path needs a proof, all four distinct checks, and no reason.
select pg_temp.check_that(pg_temp.refused(:c3, '{"decision":"verified","method":"document","checks":["name","address","readable"]}', 'PT400'),
    'three checks are refused');
select pg_temp.check_that(pg_temp.refused(:c3, '{"decision":"verified","method":"document","checks":["name","name","readable","document"]}', 'PT400'),
    'a repeated check is refused');
select pg_temp.check_that(pg_temp.refused(:c3, jsonb_build_object('decision', 'verified', 'method', 'document', 'checks', :all_checks::jsonb, 'note', 'fine'), 'PT400'),
    'a document approval with a reason is refused');
select pg_temp.check_that(pg_temp.refused(:c4, jsonb_build_object('decision', 'verified', 'method', 'document', 'checks', :all_checks::jsonb), 'PT400'),
    'a document approval without a proof is refused');
select pg_temp.check_that(pg_temp.audits(:c3) = 0 and pg_temp.audits(:c4) = 0, 'refused reviews leave no audit');

-- Rejection keeps its rules and has no basis.
select pg_temp.check_that(pg_temp.refused(:c3, '{"decision":"rejected","note":"The bill is from Taguig.","method":"document"}', 'PT400'),
    'a rejection with a method is refused');
select pg_temp.review(:c3, '{"decision":"rejected","note":"The bill is from Taguig."}');
select pg_temp.check_that((select residency_status = 'rejected' and residency_note = 'The bill is from Taguig.'
    from public.profiles where id = :c3::uuid), 'a rejection keeps the reason the citizen reads');
select pg_temp.check_that((pg_temp.last_audit(:c3) ->> 'method') is null, 'a rejection audit has no method');

-- A document approval records the method and the four checks.
select pg_temp.review(:c3, jsonb_build_object('decision', 'verified', 'method', 'document', 'checks', '["document","readable","address","name"]'::jsonb));
select pg_temp.check_that((select residency_status = 'verified' and residency_note is null from public.profiles where id = :c3::uuid),
    'a document approval verifies the citizen');
select pg_temp.check_that(pg_temp.last_audit(:c3) ->> 'method' = 'document'
    and jsonb_array_length(pg_temp.last_audit(:c3) -> 'checks') = 4
    and (pg_temp.last_audit(:c3) ->> 'exception_reason') is null, 'a document approval audit records method and checks');

-- The exception needs a reason, keeps it in the audit, and never shows it to the citizen.
select pg_temp.check_that(pg_temp.refused(:c4, '{"decision":"verified","method":"no_document"}', 'PT400'), 'an exception without a reason is refused');
select pg_temp.check_that(pg_temp.refused(:c4, jsonb_build_object('decision', 'verified', 'method', 'no_document', 'note', 'Known resident.', 'checks', :all_checks::jsonb), 'PT400'),
    'an exception with document checks is refused');
select pg_temp.review(:c4, '{"decision":"verified","method":"no_document","note":"Saw the original barangay certificate."}');
select pg_temp.check_that((select residency_status = 'verified' and residency_note is null from public.profiles where id = :c4::uuid),
    'the exception verifies the citizen without showing the reason');
select pg_temp.check_that(pg_temp.last_audit(:c4) ->> 'method' = 'no_document'
    and pg_temp.last_audit(:c4) ->> 'exception_reason' = 'Saw the original barangay certificate.'
    and (pg_temp.last_audit(:c4) -> 'checks') = 'null'::jsonb, 'the exception audit records its reason');
select pg_temp.check_that((select count(*) = 1 from public.notifications where user_id = :c4::uuid), 'the citizen is notified once');

-- Stale versions and non-administrators are refused as before.
select pg_temp.check_that(pg_temp.refused(:c3, '{"decision":"rejected","note":"Please send a newer bill."}', 'PT403',
    'd0000000-0000-4000-8000-000000000002'), 'a Staff member cannot review');
do $$ declare failed boolean := false; begin
    begin
        perform public.admin_change_profile('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003',
            'residency.reviewed', '{"decision":"rejected","note":"Please send a newer bill.","expected_version":"00000000-0000-4000-8000-000000000000"}');
    exception when sqlstate 'PT409' then failed := true; end;
    perform pg_temp.check_that(failed, 'a stale version is refused');
end $$;

-- A failed required audit leaves no decision.
create function pg_temp.fail_audit() returns trigger language plpgsql as $$
begin raise sqlstate 'ZZ002' using message = 'Deliberately failed audit'; end $$;
create trigger test_review_audit_failure before insert on public.activity_logs for each row execute function pg_temp.fail_audit();
select pg_temp.check_that(pg_temp.refused(:c3, '{"decision":"rejected","note":"Please send a newer bill."}', 'ZZ002'),
    'an audit failure rolls the decision back');
drop trigger test_review_audit_failure on public.activity_logs;

-- Only the API's server role can call the function.
select pg_temp.check_that(not has_function_privilege('authenticated', 'public.admin_change_profile(uuid,uuid,text,jsonb,inet)', 'execute'),
    'user tokens cannot review');

select count(*) as passed_review_checks from checks;
rollback;
