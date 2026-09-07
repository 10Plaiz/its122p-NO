-- KAMOTI: Key Alert and Monitoring for Online Tracking of Infrastructures
-- 0001_schema.sql — enums, tables, indexes, triggers
--
-- Target: Supabase (PostgreSQL 15+). Passwords are NOT stored here; Supabase Auth
-- owns auth.users and issues the JWTs. `profiles` extends auth.users with the
-- application fields from the proposal's Users entity.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------- enumerations

create type user_role     as enum ('admin', 'staff', 'citizen');
create type report_status as enum ('pending', 'under_review', 'in_progress', 'resolved');
create type photo_kind    as enum ('initial', 'resolution');
create type update_type   as enum ('status_change', 'assignment', 'remark', 'photo');

-- -------------------------------------------------------------------- profiles

create table profiles (
    id             uuid primary key references auth.users (id) on delete cascade,
    name           text        not null check (length(btrim(name)) > 0),
    email          citext      not null unique,
    role           user_role   not null default 'citizen',
    contact_number text,
    is_active      boolean     not null default true,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index profiles_role_idx on profiles (role) where is_active;

-- ------------------------------------------------------------------ categories

create table categories (
    id          bigint generated always as identity primary key,
    name        text not null unique check (length(btrim(name)) > 0),
    description text,
    is_active   boolean     not null default true,
    created_at  timestamptz not null default now()
);

-- --------------------------------------------------------------------- reports

create table reports (
    id                uuid primary key default gen_random_uuid(),
    reference_code    text not null unique,           -- e.g. KMT-2026-000123, shown to citizens
    citizen_id        uuid   not null references profiles (id) on delete restrict,
    category_id       bigint not null references categories (id) on delete restrict,
    assigned_staff_id uuid            references profiles (id) on delete set null,
    title             text not null check (length(btrim(title)) between 3 and 150),
    description       text not null check (length(btrim(description)) >= 10),
    latitude          numeric(9, 6) not null check (latitude  between  -90 and  90),
    longitude         numeric(9, 6) not null check (longitude between -180 and 180),
    address_text      text,                           -- reverse-geocoded label, optional
    status            report_status not null default 'pending',
    is_public         boolean not null default false, -- only reviewed reports reach the public board
    submitted_at      timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    resolved_at       timestamptz,
    constraint reports_resolved_at_matches_status
        check ((status = 'resolved') = (resolved_at is not null))
);

create index reports_citizen_idx  on reports (citizen_id, submitted_at desc);
create index reports_staff_idx    on reports (assigned_staff_id, status) where assigned_staff_id is not null;
create index reports_status_idx   on reports (status, submitted_at desc);
create index reports_category_idx on reports (category_id);
create index reports_location_idx on reports (latitude, longitude);
create index reports_public_idx   on reports (submitted_at desc) where is_public;

-- Human-readable reference code: KMT-<year>-<zero-padded sequence>
create sequence reports_reference_seq;

create or replace function set_reference_code() returns trigger
language plpgsql as $fn$
begin
    if new.reference_code is null then
        new.reference_code := format('KMT-%s-%s',
            to_char(now(), 'YYYY'),
            lpad(nextval('reports_reference_seq')::text, 6, '0'));
    end if;
    return new;
end;
$fn$;

create trigger reports_set_reference_code
    before insert on reports
    for each row execute function set_reference_code();

-- ---------------------------------------------------------------- report media

create table report_photos (
    id           uuid primary key default gen_random_uuid(),
    report_id    uuid not null references reports (id) on delete cascade,
    kind         photo_kind not null default 'initial',
    storage_path text not null,                       -- object key in the Supabase Storage bucket
    uploaded_by  uuid not null references profiles (id) on delete restrict,
    created_at   timestamptz not null default now()
);

create index report_photos_report_idx on report_photos (report_id, kind);

-- --------------------------------------------------------------- audit history

create table report_updates (
    id              uuid primary key default gen_random_uuid(),
    report_id       uuid not null references reports (id) on delete cascade,
    updated_by      uuid not null references profiles (id) on delete restrict,
    update_type     update_type not null,
    previous_status report_status,
    new_status      report_status,
    details         text,
    created_at      timestamptz not null default now(),
    constraint report_updates_status_change_is_complete
        check (update_type <> 'status_change'
               or (previous_status is not null and new_status is not null))
);

create index report_updates_report_idx on report_updates (report_id, created_at desc);

-- --------------------------------------------------------------- notifications

create table notifications (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references profiles (id) on delete cascade,
    report_id  uuid          references reports (id) on delete cascade,
    message    text not null,
    is_read    boolean     not null default false,
    created_at timestamptz not null default now()
);

create index notifications_inbox_idx  on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where not is_read;

-- --------------------------------------------------------------- activity logs

-- System-wide log for the admin feature; report-scoped history lives in report_updates.
create table activity_logs (
    id          bigint generated always as identity primary key,
    actor_id    uuid references profiles (id) on delete set null,
    action      text not null,                        -- 'user.role_changed', 'category.created', ...
    entity_type text,
    entity_id   text,
    metadata    jsonb not null default '{}'::jsonb,
    ip_address  inet,
    created_at  timestamptz not null default now()
);

create index activity_logs_recent_idx on activity_logs (created_at desc);
create index activity_logs_actor_idx  on activity_logs (actor_id, created_at desc);

-- ------------------------------------------------------------- updated_at glue

create or replace function touch_updated_at() returns trigger
language plpgsql as $fn$
begin
    new.updated_at := now();
    return new;
end;
$fn$;

create trigger profiles_touch_updated_at before update on profiles
    for each row execute function touch_updated_at();

create trigger reports_touch_updated_at before update on reports
    for each row execute function touch_updated_at();

-- ----------------------------------------------------- public transparency view

-- Login-free board: reviewed reports only, and no citizen PII.
create view public_reports as
select r.id,
       r.reference_code,
       r.title,
       r.description,
       c.name as category,
       r.latitude,
       r.longitude,
       r.address_text,
       r.status,
       r.submitted_at,
       r.resolved_at
from reports r
join categories c on c.id = r.category_id
where r.is_public;
