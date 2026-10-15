-- KI-14: account rate limits shared by every API instance.
--
-- The sign-in, code, refresh, and comment limits used to count in each server's
-- memory, so on Vercel every warm instance gave an attacker a fresh allowance.
-- They now count here. Thresholds stay in src/server/lib/rate-limit.ts and are
-- sent with each call, bounded below.
--
-- A key is the SHA-256 of the limit name and its subject (a client address, an
-- email address, or an account id), so the table holds no address or email in
-- the clear. Counters are fixed windows. Expired counters are removed in bounded
-- batches; they are throttle state, not records (DM-1 does not apply), like
-- citizen_submission_events.

begin;

create table public.auth_rate_counters (
    key text primary key check (key ~ '^[0-9a-f]{64}$'),
    hits integer not null check (hits between 0 and 100000),
    reset_at timestamptz not null
);
create index auth_rate_counters_reset_idx on public.auth_rate_counters (reset_at);
alter table public.auth_rate_counters enable row level security;
revoke all on table public.auth_rate_counters from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.auth_rate_counters to service_role;

-- p_mode:
--   take    - if no rule is at its limit, count one hit on each, atomically.
--   release - give one hit back on each rule. The API releases an attempt that
--             succeeded when only failures count, before it answers, so a burst
--             of parallel guesses is still counted in full up front.
-- p_rules: 1 to 4 objects { "key": <64 hex>, "limit": 1-10000, "window_seconds": 1-86400 }.
-- Returns {"kind":"allowed"} or {"kind":"limited","retry_after_seconds":n}.
create function public.auth_rate_limit(p_mode text, p_rules jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = ''
set statement_timeout = '4s' set lock_timeout = '2s' as $fn$
declare
    rule jsonb;
    lock_id bigint;
    rule_limit integer;
    rule_window integer;
    live_hits integer;
    live_reset timestamptz;
    retry_at timestamptz;
    now_time timestamptz := pg_catalog.clock_timestamp();
begin
    if p_mode is null or p_mode not in ('take', 'release') then
        raise exception 'Unknown auth rate-limit mode';
    end if;
    if p_rules is null or pg_catalog.jsonb_typeof(p_rules) <> 'array'
        or pg_catalog.jsonb_array_length(p_rules) not between 1 and 4 then
        raise exception 'Auth rate-limit rules must be an array of 1 to 4 rules';
    end if;
    for rule in select r.value from pg_catalog.jsonb_array_elements(p_rules) as r loop
        if pg_catalog.jsonb_typeof(rule) <> 'object'
            or coalesce(rule ->> 'key', '') !~ '^[0-9a-f]{64}$'
            or coalesce(rule ->> 'limit', '') !~ '^[0-9]{1,5}$'
            or coalesce(rule ->> 'window_seconds', '') !~ '^[0-9]{1,5}$'
            or (rule ->> 'limit')::integer not between 1 and 10000
            or (rule ->> 'window_seconds')::integer not between 1 and 86400 then
            raise exception 'Invalid auth rate-limit rule';
        end if;
    end loop;

    if p_mode = 'take' then
        if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
            raise exception 'Auth rate limits require READ COMMITTED';
        end if;
        -- Sorted, so two calls that share keys always lock them in the same order.
        for lock_id in
            select distinct pg_catalog.hashtextextended('kamoti:auth-rate:' || (r.value ->> 'key'), 0) as id
            from pg_catalog.jsonb_array_elements(p_rules) as r
            order by id
        loop
            perform pg_catalog.pg_advisory_xact_lock(lock_id);
        end loop;
    end if;

    if p_mode = 'release' then
        for rule in select r.value from pg_catalog.jsonb_array_elements(p_rules) as r loop
            update public.auth_rate_counters c set hits = greatest(c.hits - 1, 0)
            where c.key = rule ->> 'key' and c.reset_at > now_time;
        end loop;
        return '{"kind":"allowed"}'::jsonb;
    end if;

    if p_mode = 'take' then
        for rule in select r.value from pg_catalog.jsonb_array_elements(p_rules) as r loop
            rule_limit := (rule ->> 'limit')::integer;
            select c.hits, c.reset_at into live_hits, live_reset
            from public.auth_rate_counters c
            where c.key = rule ->> 'key' and c.reset_at > now_time;
            if found and live_hits >= rule_limit and (retry_at is null or live_reset > retry_at) then
                retry_at := live_reset;
            end if;
        end loop;
        if retry_at is not null then
            return pg_catalog.jsonb_build_object('kind', 'limited',
                'retry_after_seconds', greatest(1, ceil(extract(epoch from retry_at - now_time)))::integer);
        end if;
    end if;

    with expired as (
        select c.key from public.auth_rate_counters c
        where c.reset_at <= now_time
        order by c.reset_at limit 256 for update skip locked
    )
    delete from public.auth_rate_counters c using expired
    where c.key = expired.key and c.reset_at <= now_time;

    for rule in select r.value from pg_catalog.jsonb_array_elements(p_rules) as r loop
        rule_window := (rule ->> 'window_seconds')::integer;
        insert into public.auth_rate_counters as c (key, hits, reset_at)
        values (rule ->> 'key', 1, now_time + pg_catalog.make_interval(secs => rule_window))
        on conflict (key) do update set
            hits = case when c.reset_at <= now_time then 1 else least(c.hits + 1, 100000) end,
            reset_at = case when c.reset_at <= now_time then excluded.reset_at else c.reset_at end;
    end loop;
    return '{"kind":"allowed"}'::jsonb;
end;
$fn$;

revoke all on function public.auth_rate_limit(text, jsonb) from public, anon, authenticated;
grant execute on function public.auth_rate_limit(text, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
