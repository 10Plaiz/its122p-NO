\set ON_ERROR_STOP on
do $$ begin
    if current_setting('kamoti.test_database', true) is distinct from 'disposable' then
        raise exception 'Run residency tests only in a disposable database.';
    end if;
end $$;

\if :{?prepare_legacy}
begin;
insert into auth.users(id) values
    ('d0000000-0000-4000-8000-000000000001'), ('d0000000-0000-4000-8000-000000000002'),
    ('d0000000-0000-4000-8000-000000000003'), ('d0000000-0000-4000-8000-000000000004');
insert into public.profiles(id, name, email, role, is_active, residency_status, residency_proof_path,
    residency_note, residency_reviewed_by, residency_reviewed_at, created_at, updated_at) values
    ('d0000000-0000-4000-8000-000000000001', 'Legacy Administrator', 'residency-admin@kamoti.invalid', 'admin', false,
        null, null, null, null, null, '2026-01-01', '2026-01-02'),
    ('d0000000-0000-4000-8000-000000000002', 'Legacy Pending', 'residency-pending@kamoti.invalid', 'citizen', true,
        'pending', 'legacy/pending.pdf', null, null, null, '2026-01-01', '2026-01-02'),
    ('d0000000-0000-4000-8000-000000000003', 'Legacy Verified', 'residency-verified@kamoti.invalid', 'citizen', true,
        'verified', 'legacy/verified.jpg', null, 'd0000000-0000-4000-8000-000000000001', '2026-01-03', '2026-01-01', '2026-01-02'),
    ('d0000000-0000-4000-8000-000000000004', 'Legacy Rejected', 'residency-rejected@kamoti.invalid', 'citizen', true,
        'rejected', 'legacy/rejected.pdf', 'The document is not readable.', 'd0000000-0000-4000-8000-000000000001', '2026-01-03', '2026-01-01', '2026-01-02');
commit;
\else
begin;
create temporary table checks(name text primary key);
create function pg_temp.check_that(ok boolean, label text) returns void language plpgsql as $$
begin
    if ok is distinct from true then raise exception 'Check failed: %', label; end if;
    insert into checks values(label);
end $$;
create function pg_temp.must_fail(statement text, expected_state text, label text) returns void language plpgsql as $$
declare failed boolean := false;
begin
    begin execute statement;
    exception when others then
        if sqlstate <> expected_state then raise; end if;
        if expected_state = 'PT409' and sqlerrm not like '%Refresh%' and sqlerrm not like '%refresh%'
            and sqlerrm not like '%Start a new submission%' and sqlerrm not like '%Upload the proof%' then
            raise exception 'Conflict lacks recovery instruction: %', sqlerrm;
        end if;
        failed := true;
    end;
    perform pg_temp.check_that(failed, label);
end $$;
create function pg_temp.fail_write() returns trigger language plpgsql as $$
begin raise sqlstate 'ZZ061' using message = 'Required write failed.'; end $$;

select pg_temp.check_that((select count(*) = 3 from public.profiles p
    join public.residency_proof_versions v on v.id = p.residency_proof_id and v.user_id = p.id and v.object_path = p.residency_proof_path
    where p.id in ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004')
        and v.sha256 is null and v.superseded_at is null and v.created_at = '2026-01-01'
        and p.updated_at = '2026-01-02'), 'backfill binds three legacy proofs without hashes or edit timestamps');
select pg_temp.check_that((select residency_status = 'pending' and residency_proof_path = 'legacy/pending.pdf'
    and residency_reviewed_at is null from public.profiles where id = 'd0000000-0000-4000-8000-000000000002'),
    'backfill preserves pending proof and status');
select pg_temp.check_that((select residency_status = 'verified' and residency_proof_path = 'legacy/verified.jpg'
    and residency_reviewed_at = '2026-01-03' and residency_reviewed_by = 'd0000000-0000-4000-8000-000000000001'
    from public.profiles where id = 'd0000000-0000-4000-8000-000000000003'), 'backfill preserves verification and reviewer');
select pg_temp.check_that((select residency_status = 'rejected' and residency_proof_path = 'legacy/rejected.pdf'
    and residency_note = 'The document is not readable.' and residency_reviewed_at = '2026-01-03'
    from public.profiles where id = 'd0000000-0000-4000-8000-000000000004'), 'backfill preserves rejection and note');
select pg_temp.check_that((select residency_proof_id is null and residency_proof_path is null and residency_review_version is not null
    from public.profiles where id = 'd0000000-0000-4000-8000-000000000001'), 'backfill leaves accounts without proof empty');

update public.profiles set is_active = true where id = 'd0000000-0000-4000-8000-000000000001';

insert into auth.users(id) values ('d0000000-0000-4000-8000-000000000005'), ('d0000000-0000-4000-8000-000000000006'),
    ('d0000000-0000-4000-8000-000000000007');
insert into public.profiles(id, name, email, role, first_name, last_name, barangay, address_line, residency_status) values
    ('d0000000-0000-4000-8000-000000000005', 'New Citizen', 'residency-new@kamoti.invalid', 'citizen', 'New', 'Citizen', 'Poblacion', 'Test address', 'pending'),
    ('d0000000-0000-4000-8000-000000000006', 'No Proof', 'residency-none@kamoti.invalid', 'citizen', 'No', 'Proof', 'Poblacion', 'Test address', 'pending');
insert into storage.objects(bucket_id, name) values
    ('residency-proofs', 'd0000000-0000-4000-8000-000000000005/e0000000-0000-4000-8000-000000000001.pdf'),
    ('residency-proofs', 'd0000000-0000-4000-8000-000000000005/e0000000-0000-4000-8000-000000000002.pdf'),
    ('residency-proofs', 'd0000000-0000-4000-8000-000000000005/e0000000-0000-4000-8000-000000000003.png');

do $$
declare
    citizen constant uuid := 'd0000000-0000-4000-8000-000000000005';
    admin constant uuid := 'd0000000-0000-4000-8000-000000000001';
    none constant uuid := 'd0000000-0000-4000-8000-000000000006';
    proof1 constant uuid := 'e0000000-0000-4000-8000-000000000001';
    proof2 constant uuid := 'e0000000-0000-4000-8000-000000000002';
    proof3 constant uuid := 'e0000000-0000-4000-8000-000000000003';
    path1 constant text := citizen::text || '/' || proof1::text || '.pdf';
    path2 constant text := citizen::text || '/' || proof2::text || '.pdf';
    path3 constant text := citizen::text || '/' || proof3::text || '.png';
    hash constant text := repeat('a', 64);
    old_version uuid;
    review_version uuid;
    result jsonb;
    before public.profiles%rowtype;
    after public.profiles%rowtype;
    audit_count bigint;
    notice_count bigint;
    field text;
begin
    select * into before from public.profiles where id = citizen;
    old_version := before.residency_review_version;
    result := public.complete_residency_proof(citizen, proof1, path1, hash, old_version);
    perform pg_temp.check_that(result->>'residency_proof_id' = proof1::text and result->>'residency_review_version' <> old_version::text
        and result->>'residency_status' = 'pending' and result->>'has_residency_proof' = 'true' and not result ? 'residency_proof_path',
        'first upload returns proof identity and changed review version without private path');
    perform pg_temp.must_fail(format('select public.admin_change_profile(%L,%L,%L,%L::jsonb)', admin, citizen, 'residency.reviewed',
        jsonb_build_object('decision', 'verified', 'expected_version', old_version)), 'PT409', 'upload first rejects review of earlier account');
    review_version := (result->>'residency_review_version')::uuid;
    result := public.admin_change_profile(admin, citizen, 'residency.reviewed', jsonb_build_object('decision', 'verified', 'expected_version', review_version));
    perform pg_temp.check_that(result->>'residency_status' = 'verified' and result->>'residency_proof_id' = proof1::text
        and result->>'residency_review_version' <> review_version::text and not result ? 'residency_proof_path', 'current proof review succeeds and returns both identities');
    perform pg_temp.must_fail(format('select public.admin_change_profile(%L,%L,%L,%L::jsonb)', admin, citizen, 'residency.reviewed',
        jsonb_build_object('decision', 'rejected', 'note', 'Unreadable proof.', 'expected_version', review_version)), 'PT409', 'same displayed version accepts exactly one decision');
    select count(*) into audit_count from public.activity_logs;
    select count(*) into notice_count from public.notifications;
    result := public.complete_residency_proof(citizen, proof1, path1, hash, old_version);
    perform pg_temp.check_that(result->>'residency_status' = 'verified' and (select count(*) = audit_count from public.activity_logs)
        and (select count(*) = notice_count from public.notifications), 'committed upload retry preserves later approval without duplicate effects');
    perform pg_temp.must_fail(format('select public.complete_residency_proof(%L,%L,%L,%L,%L)', citizen, proof2, path2, hash, review_version),
        'PT409', 'review first rejects an upload with the earlier review version');
    perform pg_temp.check_that(not exists(select 1 from public.residency_proof_versions where id = proof2)
        and (select residency_proof_id = proof1 and residency_status = 'verified' from public.profiles where id = citizen),
        'stale upload leaves the approved proof attached');
    perform pg_temp.check_that((select metadata @> jsonb_build_object('residency_review_version', review_version, 'residency_proof_id', proof1,
        'name', 'New Citizen', 'first_name', 'New', 'last_name', 'Citizen', 'barangay', 'Poblacion', 'address_line', 'Test address', 'role', 'citizen', 'is_active', true)
        from public.activity_logs where actor_id = admin and action = 'residency.reviewed' and entity_id = citizen::text),
        'decision audit identifies the inspected proof and account details');
    result := public.admin_change_profile(admin, citizen, 'residency.reviewed', jsonb_build_object('decision', 'verified',
        'expected_version', (result->>'residency_review_version')::uuid));
    perform pg_temp.check_that(result->>'residency_status' = 'verified' and result->>'residency_review_version' <> review_version::text,
        'a refreshed version allows an intentional later decision');
    perform pg_temp.must_fail(format('select public.complete_residency_proof(%L,%L,%L,%L,%L)', citizen, proof1, path1, repeat('b', 64), old_version),
        'PT409', 'submission identity cannot be reused for different content');
    perform pg_temp.must_fail(format('select public.admin_change_profile(%L,%L,%L,%L::jsonb)', admin, citizen, 'residency.reviewed', '{"decision":"verified"}'),
        'PT400', 'review requires expected version');
    perform pg_temp.must_fail(format('select public.admin_change_profile(%L,%L,%L,%L::jsonb)', admin, citizen, 'residency.reviewed', '{"decision":"verified","expected_version":"bad"}'),
        'PT400', 'review rejects malformed expected version');

    select * into before from public.profiles where id = citizen;
    result := public.update_own_profile(citizen, '{"first_name":"Changed","name":"Changed Citizen"}');
    perform pg_temp.check_that(result->>'residency_status' = 'pending' and result->>'residency_reviewed_at' is null
        and result->>'residency_reviewed_by' is null and result->>'residency_review_version' <> before.residency_review_version::text,
        'self name change resets the current verified decision');
    perform pg_temp.must_fail(format('select public.admin_change_profile(%L,%L,%L,%L::jsonb)', admin, citizen, 'residency.reviewed',
        jsonb_build_object('decision', 'verified', 'expected_version', before.residency_review_version)), 'PT409', 'name change invalidates the earlier proof review');
    foreach field in array array['middle_name', 'last_name', 'suffix', 'barangay', 'address_line'] loop
        select * into before from public.profiles where id = citizen;
        result := public.update_own_profile(citizen, jsonb_build_object(field, case field when 'suffix' then 'Jr.' when 'barangay' then 'Bangkal' else 'Changed' end));
        perform pg_temp.check_that(result->>'residency_review_version' <> before.residency_review_version::text, field || ' change invalidates the review version');
    end loop;
    old_version := (result->>'residency_review_version')::uuid;
    result := public.admin_change_profile(admin, citizen, 'residency.reviewed', jsonb_build_object('decision', 'rejected', 'note', 'Upload a readable document.', 'expected_version', old_version));
    result := public.update_own_profile(citizen, '{"address_line":"Rejected resident new address","name":"Rejected new name"}');
    perform pg_temp.check_that(result->>'residency_status' = 'rejected' and result->>'residency_note' = 'Upload a readable document.',
        'identity and address updates preserve the current rejection');
    old_version := (result->>'residency_review_version')::uuid;
    result := public.complete_residency_proof(citizen, proof2, path2, hash, old_version);
    perform pg_temp.check_that(result->>'residency_status' = 'pending' and result->>'residency_proof_id' = proof2::text
        and (select superseded_at is not null and object_path = path1 and sha256 = hash from public.residency_proof_versions where id = proof1),
        'same extension replacement resets rejection and retains previous proof bytes identity');
    result := public.complete_residency_proof(citizen, proof1, path1, hash, old_version);
    perform pg_temp.check_that(result->>'residency_proof_id' = proof2::text, 'retry of a superseded submission returns the current proof');
    perform pg_temp.must_fail(format('select public.admin_change_profile(%L,%L,%L,%L::jsonb)', admin, citizen, 'residency.reviewed',
        jsonb_build_object('decision', 'verified', 'expected_version', old_version)), 'PT409', 'same extension replacement invalidates earlier review');
    old_version := (result->>'residency_review_version')::uuid;
    result := public.complete_residency_proof(citizen, proof3, path3, hash, old_version);
    perform pg_temp.must_fail(format('select public.admin_change_profile(%L,%L,%L,%L::jsonb)', admin, citizen, 'residency.reviewed',
        jsonb_build_object('decision', 'verified', 'expected_version', old_version)), 'PT409', 'different extension replacement invalidates earlier review');
    perform pg_temp.check_that((select count(*) = 3 from storage.objects where bucket_id = 'residency-proofs' and name in (path1, path2, path3)),
        'all replacement objects remain present');

    select * into before from public.profiles where id = none;
    result := public.admin_change_profile(admin, none, 'residency.reviewed', jsonb_build_object('decision', 'verified', 'expected_version', before.residency_review_version));
    perform pg_temp.check_that(result->>'residency_status' = 'verified' and result->>'has_residency_proof' = 'false'
        and result->>'residency_proof_id' is null, 'current no-proof approval is allowed');
    perform pg_temp.must_fail(format('select public.admin_change_profile(%L,%L,%L,%L::jsonb)', admin, none, 'residency.reviewed',
        jsonb_build_object('decision', 'verified', 'expected_version', before.residency_review_version)), 'PT409', 'no-proof approval also invalidates repeated review');
    select * into before from public.profiles where id = none;
    result := public.update_own_profile(none, '{"address_line":"Changed no-proof address"}');
    perform pg_temp.check_that(result->>'residency_status' = 'pending' and result->>'residency_reviewed_at' is null
        and result->>'has_residency_proof' = 'false', 'address change resets current no-proof approval');
    perform pg_temp.must_fail(format('select public.complete_residency_proof(%L,%L,%L,%L,%L)', none, proof3,
        none::text || '/' || proof3::text || '.png', hash, result->>'residency_review_version'), 'PT409', 'submission identity cannot be claimed by another owner');
    perform pg_temp.must_fail(format('select public.admin_change_profile(%L,%L,%L,%L::jsonb)', admin, none, 'residency.reviewed',
        jsonb_build_object('decision', 'rejected', 'note', 'Unreadable proof.', 'expected_version', result->>'residency_review_version')),
        'PT400', 'current no-proof rejection is refused');

    select * into before from public.profiles where id = citizen;
    update public.profiles set phone_verified_at = '2026-01-03', contact_number = '09123456789' where id = citizen;
    result := public.update_own_profile(citizen, '{"contact_number":"09123456789"}');
    perform pg_temp.check_that(result->>'phone_verified_at' is not null and result->>'residency_review_version' = before.residency_review_version::text,
        'unchanged phone retains verification and residency version');
    result := public.update_own_profile(citizen, '{"contact_number":"09987654321"}');
    perform pg_temp.check_that(result->>'phone_verified_at' is null and result->>'residency_review_version' = before.residency_review_version::text,
        'changed phone clears only phone verification');
    perform pg_temp.check_that((select metadata @> '{"contact_number":{"from":"09123456789","to":"09987654321"}}'::jsonb
        from public.activity_logs where actor_id = citizen and action = 'user.updated' order by id desc limit 1), 'phone audit retains the locked previous number');
    foreach field in array array['role', 'is_active'] loop
        select * into before from public.profiles where id = citizen;
        result := public.admin_change_profile(admin, citizen, 'user.updated',
            case field when 'role' then '{"role":"staff"}'::jsonb else '{"is_active":false}'::jsonb end);
        perform pg_temp.check_that(result->>'residency_review_version' <> before.residency_review_version::text, field || ' change invalidates prior review');
        perform pg_temp.must_fail(format('select public.complete_residency_proof(%L,%L,%L,%L,%L)', citizen, proof3, path3, hash, before.residency_review_version),
            'PT403', field || ' restriction applies to upload retries');
        perform pg_temp.must_fail(format('select public.update_own_profile(%L,%L::jsonb)', citizen, '{}'), 'PT403', field || ' restriction applies to self updates');
        perform public.admin_change_profile(admin, citizen, 'user.updated',
            case field when 'role' then '{"role":"citizen"}'::jsonb else '{"is_active":true}'::jsonb end);
    end loop;
    result := public.admin_create_profile(admin, 'd0000000-0000-4000-8000-000000000007',
        '{"name":"Created Citizen","email":"residency-created@kamoti.invalid","role":"citizen"}');
    perform pg_temp.check_that(result ? 'residency_proof_id' and result->>'residency_review_version' is not null
        and not result ? 'residency_proof_path' and result->>'has_residency_proof' = 'false', 'account creation returns both identities from defaults');
    perform pg_temp.must_fail(format('update public.profiles set residency_proof_id=%L,residency_proof_path=%L where id=%L', proof3, path3, none),
        '23503', 'profile cannot attach another owner proof');
    perform pg_temp.must_fail(format('update public.profiles set residency_proof_path=%L where id=%L', path1, citizen), '23503', 'profile cannot pair current proof ID with a different path');
    perform pg_temp.must_fail(format('update public.profiles set residency_proof_id=null where id=%L', citizen), '23514', 'profile cannot keep a path without a proof identity');
    foreach field in array array['id', 'user_id', 'object_path', 'sha256', 'created_at'] loop
        perform pg_temp.must_fail(format('update public.residency_proof_versions set %I=%s where id=%L', field,
            case field when 'id' then quote_literal(gen_random_uuid()) when 'user_id' then quote_literal(none)
            when 'object_path' then quote_literal('changed.pdf') when 'sha256' then quote_literal(repeat('b',64)) else quote_literal('2026-01-04') end, proof1),
            'PT400', field || ' proof field is immutable');
    end loop;
    perform pg_temp.must_fail(format('delete from public.residency_proof_versions where id=%L', proof1), 'PT400', 'superseded proof inventory cannot be deleted');
    perform pg_temp.must_fail(format('update public.residency_proof_versions set superseded_at=null where id=%L', proof1), 'PT400', 'superseded time cannot be cleared');
    select * into before from public.profiles where id = citizen;
    perform pg_temp.must_fail(format('select public.complete_residency_proof(%L,%L,%L,%L,%L)', citizen,
        'e0000000-0000-4000-8000-000000000004', citizen::text || '/e0000000-0000-4000-8000-000000000004.pdf', hash, before.residency_review_version),
        'PT409', 'proof attachment requires a stored object');
    select * into after from public.profiles where id = citizen;
    perform pg_temp.check_that(to_jsonb(before) = to_jsonb(after), 'missing object leaves profile unchanged');
end $$;

create trigger test_residency_audit_failure before insert on public.activity_logs for each row execute function pg_temp.fail_write();
do $$
declare
    citizen constant uuid := 'd0000000-0000-4000-8000-000000000005';
    admin constant uuid := 'd0000000-0000-4000-8000-000000000001';
    proof constant uuid := 'e0000000-0000-4000-8000-000000000004';
    path constant text := citizen::text || '/' || proof::text || '.pdf';
    before public.profiles%rowtype;
    after public.profiles%rowtype;
    notices bigint;
begin
    insert into storage.objects(bucket_id, name) values ('residency-proofs', path);
    select * into before from public.profiles where id = citizen;
    select count(*) into notices from public.notifications;
    perform pg_temp.must_fail(format('select public.admin_change_profile(%L,%L,%L,%L::jsonb)', admin, citizen, 'residency.reviewed',
        jsonb_build_object('decision', 'verified', 'expected_version', before.residency_review_version)), 'ZZ061', 'decision propagates required audit failure');
    select * into after from public.profiles where id = citizen;
    perform pg_temp.check_that(to_jsonb(after) = to_jsonb(before) and (select count(*) = notices from public.notifications), 'audit failure rolls back decision version and notification');
    perform pg_temp.must_fail(format('select public.complete_residency_proof(%L,%L,%L,%L,%L)', citizen, proof, path, repeat('a',64), before.residency_review_version),
        'ZZ061', 'upload propagates required audit failure');
    select * into after from public.profiles where id = citizen;
    perform pg_temp.check_that(to_jsonb(after) = to_jsonb(before) and not exists(select 1 from public.residency_proof_versions where id = proof)
        and (select superseded_at is null from public.residency_proof_versions where id = before.residency_proof_id)
        and exists(select 1 from storage.objects where bucket_id = 'residency-proofs' and name = path), 'upload audit failure retains current proof and uncertain uploaded object');
    perform pg_temp.must_fail(format('select public.update_own_profile(%L,%L::jsonb)', citizen, '{"address_line":"Failed address"}'),
        'ZZ061', 'self update propagates required audit failure');
    select * into after from public.profiles where id = citizen;
    perform pg_temp.check_that(to_jsonb(after) = to_jsonb(before), 'self audit failure rolls back account and review version');
end $$;
drop trigger test_residency_audit_failure on public.activity_logs;
create trigger test_residency_notice_failure before insert on public.notifications for each row execute function pg_temp.fail_write();
do $$
declare before public.profiles%rowtype; after public.profiles%rowtype; audits bigint;
begin
    select * into before from public.profiles where id = 'd0000000-0000-4000-8000-000000000005';
    select count(*) into audits from public.activity_logs;
    perform pg_temp.must_fail(format('select public.admin_change_profile(%L,%L,%L,%L::jsonb)', 'd0000000-0000-4000-8000-000000000001', before.id, 'residency.reviewed',
        jsonb_build_object('decision', 'verified', 'expected_version', before.residency_review_version)), 'ZZ061', 'decision propagates required notification failure');
    select * into after from public.profiles where id = before.id;
    perform pg_temp.check_that(to_jsonb(after) = to_jsonb(before) and (select count(*) = audits from public.activity_logs),
        'notification failure rolls back decision and audit');
end $$;
drop trigger test_residency_notice_failure on public.notifications;

select pg_temp.check_that(not has_table_privilege('anon', 'public.residency_proof_versions', 'select')
    and not has_table_privilege('authenticated', 'public.residency_proof_versions', 'insert'), 'client roles cannot read or insert proof inventory');
select pg_temp.check_that(not has_function_privilege('anon', 'public.complete_residency_proof(uuid,uuid,text,text,uuid,inet)', 'execute')
    and not has_function_privilege('authenticated', 'public.update_own_profile(uuid,jsonb,inet)', 'execute'), 'client roles cannot call citizen write functions');
select pg_temp.check_that(has_function_privilege('service_role', 'public.complete_residency_proof(uuid,uuid,text,text,uuid,inet)', 'execute')
    and has_function_privilege('service_role', 'public.update_own_profile(uuid,jsonb,inet)', 'execute')
    and has_table_privilege('service_role', 'public.residency_proof_versions', 'insert'), 'server role can call citizen writes and create proof inventory');
select pg_temp.check_that(not has_column_privilege('service_role', 'public.residency_proof_versions', 'sha256', 'update')
    and not has_table_privilege('service_role', 'public.residency_proof_versions', 'delete'), 'server role cannot overwrite hashes or delete proof inventory');
set local role service_role;
do $$
declare result jsonb;
begin
    result := public.update_own_profile('d0000000-0000-4000-8000-000000000005', '{}');
    result := public.complete_residency_proof('d0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000004',
        'd0000000-0000-4000-8000-000000000005/e0000000-0000-4000-8000-000000000004.pdf', repeat('a',64),
        (result->>'residency_review_version')::uuid);
    result := public.admin_change_profile('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 'residency.reviewed',
        jsonb_build_object('decision', 'verified', 'expected_version', result->>'residency_review_version'));
    if result->>'residency_status' is distinct from 'verified' then raise exception 'Server role decision failed.'; end if;
end $$;
reset role;
select pg_temp.check_that((select residency_status = 'verified' from public.profiles where id = 'd0000000-0000-4000-8000-000000000005'),
    'actual server role can perform self update, proof replacement, and residency review');
select count(*) as passed_residency_checks from checks;
rollback;
\endif
