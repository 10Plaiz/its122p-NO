-- KAMOTI: records are never deleted (DM-1); cancelled-report photo files expire (DM-2)
--
-- Every foreign key that used to cascade now restricts, so deleting a parent row
-- fails instead of silently taking its history with it. The app already deactivates
-- instead of deleting (profiles.is_active, categories.is_active, the 'cancelled'
-- status); these constraints make the database refuse the shortcut as well.
--
-- Constraint names are PostgreSQL's defaults (<table>_<column>_fkey), because every
-- key below was declared inline in 20260918000001_schema.sql or
-- 20260918000005_report_inspections.sql. The check at the end fails the migration if
-- any cascading key survives, so a constraint renamed on a live database cannot leave
-- a cascade behind unnoticed.

begin;

-- ------------------------------------------------------- report children: restrict

alter table public.report_photos
    drop constraint if exists report_photos_report_id_fkey,
    add constraint report_photos_report_id_fkey
        foreign key (report_id) references public.reports (id) on delete restrict;

alter table public.report_updates
    drop constraint if exists report_updates_report_id_fkey,
    add constraint report_updates_report_id_fkey
        foreign key (report_id) references public.reports (id) on delete restrict;

alter table public.report_inspections
    drop constraint if exists report_inspections_report_id_fkey,
    add constraint report_inspections_report_id_fkey
        foreign key (report_id) references public.reports (id) on delete restrict;

alter table public.notifications
    drop constraint if exists notifications_report_id_fkey,
    add constraint notifications_report_id_fkey
        foreign key (report_id) references public.reports (id) on delete restrict;

-- ------------------------------------------------------------ people: restrict

alter table public.notifications
    drop constraint if exists notifications_user_id_fkey,
    add constraint notifications_user_id_fkey
        foreign key (user_id) references public.profiles (id) on delete restrict;

-- Deleting a user in the Supabase dashboard (Authentication > Users) now fails for
-- anyone with a profile. That is on purpose: an account is closed by setting
-- profiles.is_active = false, which keeps their reports, history, and audit trail.
alter table public.profiles
    drop constraint if exists profiles_id_fkey,
    add constraint profiles_id_fkey
        foreign key (id) references auth.users (id) on delete restrict;

-- The two "set null" keys become restrict too. They only fire when a profile is
-- deleted, and then they would erase who was assigned a report and who performed a
-- logged action: the audit trail would survive with its names blanked out. With
-- profiles never deleted they should never fire, so restrict loses nothing and makes
-- an accidental delete fail loudly instead.
alter table public.reports
    drop constraint if exists reports_assigned_staff_id_fkey,
    add constraint reports_assigned_staff_id_fkey
        foreign key (assigned_staff_id) references public.profiles (id) on delete restrict;

alter table public.activity_logs
    drop constraint if exists activity_logs_actor_id_fkey,
    add constraint activity_logs_actor_id_fkey
        foreign key (actor_id) references public.profiles (id) on delete restrict;

-- ------------------------------------------------------------- photo retention

-- Set by POST /api/maintenance/purge-cancelled-photos once a cancelled report's photo
-- file has been removed from Storage. The row stays, so the report still shows that a
-- photo was attached; storage_path is kept for the audit trail but no longer resolves.
alter table public.report_photos
    add column if not exists purged_at timestamptz;

-- Finds the photos still waiting for the purge without scanning every photo.
create index if not exists report_photos_unpurged_idx
    on public.report_photos (report_id) where purged_at is null;

-- ---------------------------------------------------------------------- check

do $check$
declare
    leftover text;
begin
    select string_agg(format('%s.%s', conrelid::regclass, conname), ', ')
      into leftover
      from pg_constraint
     where contype = 'f'
       and confdeltype in ('c', 'n', 'd')  -- cascade, set null, set default
       and conrelid in ('public.profiles'::regclass,
                        'public.reports'::regclass,
                        'public.report_photos'::regclass,
                        'public.report_updates'::regclass,
                        'public.report_inspections'::regclass,
                        'public.notifications'::regclass,
                        'public.activity_logs'::regclass);

    if leftover is not null then
        raise exception 'Foreign keys still delete or blank rows: %', leftover;
    end if;
end
$check$;

commit;
