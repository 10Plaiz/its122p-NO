-- Staff assessments are separate from report_updates, which records changes
-- to the report workflow. More than one inspection may be recorded per report.
begin;

create table public.report_inspections (
    id           bigint generated always as identity primary key,
    report_id    uuid        not null references public.reports (id) on delete cascade,
    inspector_id uuid        not null references public.profiles (id) on delete restrict,
    severity     text        not null check (severity in ('low', 'medium', 'high')),
    findings     text        not null check (length(btrim(findings)) > 0),
    inspected_at timestamptz not null default now(),
    created_at   timestamptz not null default now()
);

create index report_inspections_report_idx
    on public.report_inspections (report_id, inspected_at desc);
create index report_inspections_inspector_idx
    on public.report_inspections (inspector_id, inspected_at desc);

alter table public.report_inspections enable row level security;

-- The API uses service_role and will enforce staff/admin permissions when
-- inspection endpoints are added. Browser roles have no direct access.
revoke all on table public.report_inspections from public, anon, authenticated;
revoke all on sequence public.report_inspections_id_seq from public, anon, authenticated;
grant select, insert on table public.report_inspections to service_role;
grant usage, select on sequence public.report_inspections_id_seq to service_role;

commit;
