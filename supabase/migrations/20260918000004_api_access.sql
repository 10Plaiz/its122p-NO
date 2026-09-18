-- Protected application data is accessed through Express with service_role.
-- RLS filters rows, but the earlier policies also allow direct client writes
-- that bypass API checks for account activation, assignment and review.
-- Keep direct client access limited to the two public read surfaces.

begin;

revoke all privileges on table
    public.profiles,
    public.categories,
    public.reports,
    public.report_photos,
    public.report_updates,
    public.notifications,
    public.activity_logs,
    public.public_reports
from public, anon, authenticated;

revoke all privileges on sequence
    public.categories_id_seq,
    public.reports_reference_seq,
    public.activity_logs_id_seq
from public, anon, authenticated;

grant select on table public.categories, public.public_reports
to anon, authenticated;

-- Preserve the backend's data access explicitly, including generated IDs.
grant select, insert, update, delete on table
    public.profiles,
    public.categories,
    public.reports,
    public.report_photos,
    public.report_updates,
    public.notifications,
    public.activity_logs
to service_role;

grant select on table public.public_reports to service_role;
grant usage, select on sequence
    public.categories_id_seq,
    public.reports_reference_seq,
    public.activity_logs_id_seq
to service_role;

commit;
