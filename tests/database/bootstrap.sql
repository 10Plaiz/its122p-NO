\set ON_ERROR_STOP on

do $$ begin
    if current_database() not like 'kamoti_test_%'
       or to_regclass('public.profiles') is not null
       or to_regclass('auth.users') is not null
       or to_regclass('storage.objects') is not null then
        raise exception 'Use a fresh disposable database named kamoti_test_*.';
    end if;
end $$;

do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
);
create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null,
    unique (bucket_id, name)
);
grant usage on schema storage to service_role;
grant all on all tables in schema storage to service_role;

select format('alter database %I set kamoti.test_database = %L', current_database(), 'disposable') \gexec
