-- Staff workflow (SW-1, SW-4, SW-6): who specialises in which category, when a
-- report was assigned and last changed status, and the closure request an
-- administrator verifies before a report is closed.
--
-- Rows are never deleted (DM-1): a specialization is switched off with is_active,
-- and every foreign key here restricts rather than cascades.

-- New history entries for the closure flow. Added outside the transaction below
-- and not used in this file: a new enum value cannot be used in the transaction
-- that adds it.
alter type public.update_type add value if not exists 'closure_request';
alter type public.update_type add value if not exists 'verification';

begin;

-- ------------------------------------------------------- staff specializations

create table public.staff_specializations (
    staff_id    uuid        not null references public.profiles (id) on delete restrict,
    category_id bigint      not null references public.categories (id) on delete restrict,
    is_active   boolean     not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    primary key (staff_id, category_id)
);

create index staff_specializations_category_idx
    on public.staff_specializations (category_id) where is_active;

create trigger staff_specializations_touch_updated_at
    before update on public.staff_specializations
    for each row execute function touch_updated_at();

alter table public.staff_specializations enable row level security;

-- Read and written only by the API with service_role, like every protected table
-- (see 20260918000004_api_access.sql). No delete grant: rows are switched off.
revoke all on table public.staff_specializations from public, anon, authenticated;
grant select, insert, update on table public.staff_specializations to service_role;

-- ------------------------------------------------------------ report workflow

alter table public.reports
    -- When the current assignee got the report. Cleared never; replaced on reassignment.
    add column assigned_at          timestamptz,
    -- When the report entered its current status. Drives the "Delayed" flag.
    add column status_changed_at    timestamptz not null default now(),
    -- A closure request from the assigned staff member, waiting for an
    -- administrator. outcome is the status the report takes when approved;
    -- 'rejected' is accepted here so the later rejected status (SW-7) needs no
    -- new column, but the API only sends 'resolved' for now.
    add column closure_requested_at timestamptz,
    add column closure_requested_by uuid references public.profiles (id) on delete restrict,
    add column closure_outcome      text check (closure_outcome in ('resolved', 'rejected')),
    add column closure_reason       text,
    -- The administrator who approved the closure, and when.
    add column verified_by          uuid references public.profiles (id) on delete restrict,
    add column verified_at          timestamptz,
    -- A request is all-or-nothing: no half-filled requests.
    add constraint reports_closure_request_is_complete
        check (
            (closure_requested_at is null) = (closure_requested_by is null)
            and (closure_requested_at is null) = (closure_outcome is null)
            and (closure_requested_at is null) = (closure_reason is null)
        ),
    -- Only a request can be verified.
    add constraint reports_verification_needs_request
        check (verified_at is null or closure_requested_at is not null),
    add constraint reports_verification_is_complete
        check ((verified_at is null) = (verified_by is null));

-- Reports waiting for an administrator, for the verification queue.
create index reports_closure_pending_idx
    on public.reports (closure_requested_at)
    where closure_requested_at is not null and verified_at is null;

-- The backfills below are not edits, so they leave updated_at alone.
alter table public.reports disable trigger reports_touch_updated_at;

-- Backfill: the latest assignment in each report's history.
update public.reports r
set assigned_at = latest.created_at
from (
    select distinct on (report_id) report_id, created_at
    from public.report_updates
    where update_type = 'assignment'
    order by report_id, created_at desc
) latest
where latest.report_id = r.id
  and r.assigned_staff_id is not null;

-- Backfill: the latest status change into the current status, else submission.
update public.reports r
set status_changed_at = coalesce(
    (
        select u.created_at
        from public.report_updates u
        where u.report_id = r.id
          and u.update_type = 'status_change'
          and u.new_status = r.status
        order by u.created_at desc
        limit 1
    ),
    r.resolved_at,
    r.submitted_at
);

alter table public.reports enable trigger reports_touch_updated_at;

commit;
