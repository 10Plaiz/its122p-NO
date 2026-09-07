-- KAMOTI — 0002_rls.sql
-- Row Level Security.
--
-- The Express API talks to Supabase with the service_role key, which bypasses RLS;
-- RBAC is enforced in middleware there. These policies are defense-in-depth for
-- anything that reaches the database with an anon or user JWT (the public board,
-- Supabase Realtime, or a direct supabase-js call from the React app).

-- Role of the currently authenticated user, read without recursing into RLS.
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $fn$
    select role from profiles where id = auth.uid();
$fn$;

alter table profiles       enable row level security;
alter table categories     enable row level security;
alter table reports        enable row level security;
alter table report_photos  enable row level security;
alter table report_updates enable row level security;
alter table notifications  enable row level security;
alter table activity_logs  enable row level security;

-- -------------------------------------------------------------------- profiles

create policy profiles_read_own on profiles
    for select using (id = auth.uid() or auth_role() in ('admin', 'staff'));

create policy profiles_update_own on profiles
    for update using (id = auth.uid()) with check (id = auth.uid() and role = auth_role());

create policy profiles_admin_all on profiles
    for all using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- ------------------------------------------------------------------ categories

create policy categories_read_all on categories
    for select using (true);

create policy categories_admin_write on categories
    for all using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- --------------------------------------------------------------------- reports

-- Citizens see their own; staff see everything they may act on; admins see all.
create policy reports_read on reports
    for select using (
        citizen_id = auth.uid()
        or auth_role() in ('admin', 'staff')
        or is_public
    );

create policy reports_citizen_insert on reports
    for insert with check (citizen_id = auth.uid() and auth_role() = 'citizen');

-- Staff may only touch reports assigned to them; admins may touch any.
create policy reports_staff_update on reports
    for update using (auth_role() = 'staff' and assigned_staff_id = auth.uid())
    with check (auth_role() = 'staff' and assigned_staff_id = auth.uid());

create policy reports_admin_all on reports
    for all using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- ---------------------------------------------------------------- report media

create policy report_photos_read on report_photos
    for select using (
        auth_role() in ('admin', 'staff')
        or exists (select 1 from reports r
                   where r.id = report_photos.report_id
                     and (r.citizen_id = auth.uid() or r.is_public))
    );

create policy report_photos_insert on report_photos
    for insert with check (
        uploaded_by = auth.uid()
        and exists (select 1 from reports r
                    where r.id = report_photos.report_id
                      and (r.citizen_id = auth.uid()
                           or r.assigned_staff_id = auth.uid()
                           or auth_role() = 'admin'))
    );

-- --------------------------------------------------------------- audit history

-- History is readable by the people involved but is never edited from the client.
create policy report_updates_read on report_updates
    for select using (
        auth_role() in ('admin', 'staff')
        or exists (select 1 from reports r
                   where r.id = report_updates.report_id and r.citizen_id = auth.uid())
    );

-- --------------------------------------------------------------- notifications

create policy notifications_read_own on notifications
    for select using (user_id = auth.uid());

-- Only is_read is meant to change from the client; the API writes the rest.
create policy notifications_mark_read on notifications
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --------------------------------------------------------------- activity logs

create policy activity_logs_admin_read on activity_logs
    for select using (auth_role() = 'admin');

-- ----------------------------------------------- public transparency board view

-- The view is security-definer by default, so the anon role reads only the
-- non-PII columns it exposes, and only rows where is_public is true.
grant select on public_reports to anon, authenticated;
