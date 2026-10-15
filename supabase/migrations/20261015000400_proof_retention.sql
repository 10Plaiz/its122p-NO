-- #70: residency proof files are kept 30 days after they stop being current.
--
-- Owner decision (2026-10-15): 30 days. Rows are never deleted (DM-1); only the
-- stored file goes, and its version row records when (file_removed_at). The rule
-- lives here, so the API cannot remove or record a file early:
--
-- - A replaced proof's file may go 30 days after superseded_at. The proof an
--   account currently uses is never listed and can never be marked removed.
-- - An upload that never reached an account (no version row; an uncertain or
--   failed attachment, see API.md) may go 30 days after the object was created.
--   Any attached file has a version row, so it is never listed as unattached.
-- - Signed links exist only for the current proof and last five minutes, so no
--   link to a listed file can still be open.
-- - The decision and access audits keep the proof identity and path for good.
--
-- Deploy: apply #67's 20261015000300 first if it is not applied yet, then this,
-- then the matching API. The earlier API never calls the new function.

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

notify pgrst, 'reload schema';

commit;
