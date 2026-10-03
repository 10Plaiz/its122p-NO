-- FB-1: the citizen rates a resolved report once, and the rating reaches the
-- staff member who handled it. One row per report, written once and never
-- changed: the API (service_role) may insert and read, nothing else.
begin;

create table public.report_feedback (
    id         uuid primary key default gen_random_uuid(),
    report_id  uuid        not null unique references public.reports (id) on delete restrict,
    citizen_id uuid        not null references public.profiles (id) on delete restrict,
    -- The assignee when the rating was given. Kept on the row so a report
    -- reassigned after it was resolved does not move the rating to someone who
    -- did not do the work. Null when nobody was assigned.
    staff_id   uuid                 references public.profiles (id) on delete restrict,
    rating     smallint    not null check (rating between 1 and 5),
    comment    text        check (comment is null or (length(comment) <= 500 and length(btrim(comment)) > 0)),
    created_at timestamptz not null default now()
);

create index report_feedback_staff_idx
    on public.report_feedback (staff_id, created_at desc)
    where staff_id is not null;

alter table public.report_feedback enable row level security;

-- Browser roles have no direct access; the API enforces who may rate and read.
-- No update or delete grant, so a rating cannot be edited or removed.
revoke all on table public.report_feedback from public, anon, authenticated;
grant select, insert on table public.report_feedback to service_role;

-- Average and count in the database, so a staff member with many ratings is not
-- cut off by the API's row limit. A null staff id summarises every rating.
create function public.feedback_summary(p_staff_id uuid default null)
returns table (average numeric, total bigint)
language sql
stable
set search_path = ''
as $fn$
    select round(avg(f.rating)::numeric, 2), count(*)
    from public.report_feedback f
    where p_staff_id is null or f.staff_id = p_staff_id;
$fn$;

revoke all on function public.feedback_summary(uuid) from public, anon, authenticated;
grant execute on function public.feedback_summary(uuid) to service_role;

commit;
