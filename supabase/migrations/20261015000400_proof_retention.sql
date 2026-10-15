-- #70: residency proof files are kept 30 days after they stop being current.
--
-- Owner decision (2026-10-15): 30 days. Rows are never deleted (DM-1); only the
-- stored file goes, and its version row records when (file_removed_at). The rule
-- lives here, so the API cannot remove or record a file early:
--
-- - A replaced proof's file may go 30 days after superseded_at. The proof an
--   account currently uses is never listed and can never be marked removed.
-- - A stored file that no version row points to may go 30 days after the object
--   was created. These are uploads that never reached an account (an uncertain
--   or failed attachment, see API.md), and files replaced before version rows
--   began on 2026-10-06 (only the then-current proofs were backfilled).
-- - complete_residency_proof refuses to attach a file stored more than 29 days
--   ago, so a file the cleanup has listed can never become a current proof
--   between the listing and the removal. Exact retries of committed uploads are
--   unaffected.
-- - Removals are recorded with record_residency_proof_files_removed, in database
--   time, so the 30-day check compares like with like.
-- - Signed links exist only for the current proof and last five minutes, so no
--   link to a listed file can still be open.
-- - The decision and access audits keep the proof identity and path for good.
--
-- Deploy: apply #67's 20261015000300 first if it is not applied yet, then this,
-- then the matching API. The earlier API never calls the new functions; it
-- receives the new 409 only for an upload stored more than 29 days earlier.

begin;

alter table public.residency_proof_versions
    add column file_removed_at timestamptz,
    add constraint residency_proof_versions_file_removed_after_retention check (
        file_removed_at is null or (superseded_at is not null and file_removed_at >= superseded_at + interval '30 days')
    );
grant update (file_removed_at) on table public.residency_proof_versions to service_role;

create or replace function public.guard_residency_proof_version() returns trigger
language plpgsql security invoker set search_path = '' as $fn$
begin
    if tg_op = 'DELETE' then
        raise sqlstate 'PT400' using message = 'Proof versions must be retained.';
    end if;
    if row(new.id, new.user_id, new.object_path, new.sha256, new.created_at)
        is distinct from row(old.id, old.user_id, old.object_path, old.sha256, old.created_at)
        or (old.superseded_at is not null and new.superseded_at is distinct from old.superseded_at) then
        raise sqlstate 'PT400' using message = 'Proof identity and content cannot be changed.';
    end if;
    -- #70: a removal is recorded once, and never for an account's current proof.
    if new.file_removed_at is distinct from old.file_removed_at then
        if old.file_removed_at is not null then
            raise sqlstate 'PT400' using message = 'A removed proof file stays recorded as removed.';
        end if;
        if exists (select 1 from public.profiles where residency_proof_id = new.id) then
            raise sqlstate 'PT400' using message = 'An account''s current proof file is never removed.';
        end if;
    end if;
    return new;
end;
$fn$;

-- Files past the retention period, oldest first, at most p_limit of each kind.
-- version_id is null for an upload that never reached an account.
create function public.expired_residency_proof_files(p_limit integer default 1000)
returns table (kind text, version_id uuid, object_path text)
language sql stable security invoker set search_path = '' as $fn$
    (select 'replaced', v.id, v.object_path
     from public.residency_proof_versions v
     where v.superseded_at < clock_timestamp() - interval '30 days'
       and v.file_removed_at is null
       and not exists (select 1 from public.profiles p where p.residency_proof_id = v.id)
     order by v.superseded_at, v.id
     limit greatest(p_limit, 0))
    union all
    (select 'unattached', null, o.name
     from storage.objects o
     where o.bucket_id = 'residency-proofs'
       and o.created_at < clock_timestamp() - interval '30 days'
       and not exists (select 1 from public.residency_proof_versions v where v.object_path = o.name)
     order by o.created_at, o.name
     limit greatest(p_limit, 0))
$fn$;
revoke all on function public.expired_residency_proof_files(integer) from public, anon, authenticated;
grant execute on function public.expired_residency_proof_files(integer) to service_role;

-- Records the removal of replaced proof files, in database time, so the check
-- constraint compares like with like. Returns how many rows it recorded; rows
-- already recorded are skipped. The guard still refuses a current proof.
create function public.record_residency_proof_files_removed(p_ids uuid[]) returns integer
language plpgsql security invoker set search_path = '' as $fn$
declare recorded integer;
begin
    update public.residency_proof_versions set file_removed_at = clock_timestamp()
    where id = any(coalesce(p_ids, '{}')) and file_removed_at is null;
    get diagnostics recorded = row_count;
    return recorded;
end;
$fn$;
revoke all on function public.record_residency_proof_files_removed(uuid[]) from public, anon, authenticated;
grant execute on function public.record_residency_proof_files_removed(uuid[]) to service_role;

-- Only the age check differs from 20261006000100.
create or replace function public.complete_residency_proof(
    p_user_id uuid, p_submission_id uuid, p_object_path text, p_sha256 text,
    p_expected_version uuid, p_ip inet default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $fn$
declare
    u public.profiles%rowtype;
    proof public.residency_proof_versions%rowtype;
begin
    select * into u from public.profiles where id = p_user_id for update;
    if not found then raise sqlstate 'PT404' using message = 'Your account does not exist.'; end if;
    if u.role <> 'citizen' or not u.is_active then
        raise sqlstate 'PT403' using message = 'Only active citizens can upload residency proof.';
    end if;
    if p_submission_id is null or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
        or p_object_path is null or p_object_path !~ ('^' || p_user_id::text || '/' || p_submission_id::text || '\.(jpg|png|webp|pdf)$') then
        raise sqlstate 'PT400' using message = 'The proof identity, path, or content hash is invalid.';
    end if;
    select * into proof from public.residency_proof_versions where id = p_submission_id;
    if found then
        if row(proof.user_id, proof.object_path, proof.sha256) is distinct from row(p_user_id, p_object_path, p_sha256) then
            raise sqlstate 'PT409' using message = 'This submission has different proof content. Start a new submission.';
        end if;
        return (to_jsonb(u) - 'residency_proof_path') || jsonb_build_object('has_residency_proof', u.residency_proof_id is not null);
    end if;
    if p_expected_version is null then raise sqlstate 'PT400' using message = 'The current residency review version is required.'; end if;
    if u.residency_review_version <> p_expected_version then
        raise sqlstate 'PT409' using message = 'Your residency details changed. Refresh your account before you upload again.';
    end if;
    if u.residency_status = 'verified' then
        raise sqlstate 'PT400' using message = 'Your residency is already confirmed. There is nothing more to upload.';
    end if;
    perform 1 from storage.objects where bucket_id = 'residency-proofs' and name = p_object_path for share;
    if not found then raise sqlstate 'PT409' using message = 'The proof object is missing. Upload the proof before you try again.'; end if;
    -- #70: an upload that never reached an account is removed 30 days after it was
    -- stored. Attaching stops a day earlier, so a file the cleanup has listed can
    -- never become an account's current proof.
    perform 1 from storage.objects where bucket_id = 'residency-proofs' and name = p_object_path
        and created_at < clock_timestamp() - interval '29 days';
    if found then
        raise sqlstate 'PT409' using message = 'This upload is too old to attach. Upload the proof again as a new submission.';
    end if;
    insert into public.residency_proof_versions (id, user_id, object_path, sha256)
    values (p_submission_id, p_user_id, p_object_path, p_sha256);
    update public.profiles set residency_proof_id = p_submission_id, residency_proof_path = p_object_path,
        residency_status = 'pending', residency_note = null, residency_reviewed_by = null, residency_reviewed_at = null
    where id = u.id returning * into u;
    insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata, ip_address)
    values (u.id, 'residency.uploaded', 'user', u.id::text,
        jsonb_build_object('proof_id', u.residency_proof_id, 'review_version', u.residency_review_version), p_ip);
    return (to_jsonb(u) - 'residency_proof_path') || jsonb_build_object('has_residency_proof', true);
end;
$fn$;

notify pgrst, 'reload schema';

commit;
