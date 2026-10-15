-- KI-14 shared account rate limits. Run only against a disposable Postgres
-- database with the repository migrations; kamoti.test_database must be
-- 'disposable'. Every row below is rolled back.
\set ON_ERROR_STOP on
begin;
do $$ begin
    if current_setting('kamoti.test_database', true) is distinct from 'disposable' then
        raise exception 'Refusing to run outside the disposable database';
    end if;
end $$;

create temporary table checks (name text primary key);
create function pg_temp.check_that(ok boolean, label text) returns void language plpgsql as $$
begin
    if ok is distinct from true then raise exception 'Check failed: %', label; end if;
    insert into checks values (label);
end $$;
create function pg_temp.rule(k text, lim integer, win integer) returns jsonb language sql as $$
    select jsonb_build_object('key', encode(sha256(convert_to(k, 'UTF8')), 'hex'), 'limit', lim, 'window_seconds', win)
$$;
create function pg_temp.kind(result jsonb) returns text language sql as $$ select result ->> 'kind' $$;

-- take: counts until the limit, then refuses without counting further.
select pg_temp.check_that(pg_temp.kind(public.auth_rate_limit('take', jsonb_build_array(pg_temp.rule('t:a', 2, 900)))) = 'allowed', 'take 1 of 2');
select pg_temp.check_that(pg_temp.kind(public.auth_rate_limit('take', jsonb_build_array(pg_temp.rule('t:a', 2, 900)))) = 'allowed', 'take 2 of 2');
select pg_temp.check_that((public.auth_rate_limit('take', jsonb_build_array(pg_temp.rule('t:a', 2, 900))) ->> 'retry_after_seconds')::integer
    between 1 and 900, 'take 3 is limited with a retry time');
select pg_temp.check_that((select hits = 2 from public.auth_rate_counters
    where key = encode(sha256(convert_to('t:a', 'UTF8')), 'hex')), 'a refused take counts nothing');

-- take with two rules: one at its limit refuses both, and neither is counted.
select public.auth_rate_limit('take', jsonb_build_array(pg_temp.rule('t:b', 5, 900), pg_temp.rule('t:a', 2, 900)));
select pg_temp.check_that((select count(*) = 0 from public.auth_rate_counters
    where key = encode(sha256(convert_to('t:b', 'UTF8')), 'hex')), 'a limited pair counts neither rule');

-- release gives one hit back, never below zero, and only inside the window.
select public.auth_rate_limit('take', jsonb_build_array(pg_temp.rule('f:a', 2, 900)));
select public.auth_rate_limit('take', jsonb_build_array(pg_temp.rule('f:a', 2, 900)));
select pg_temp.check_that(pg_temp.kind(public.auth_rate_limit('take', jsonb_build_array(pg_temp.rule('f:a', 2, 900)))) = 'limited', 'two attempts reach the limit');
select public.auth_rate_limit('release', jsonb_build_array(pg_temp.rule('f:a', 2, 900)));
select pg_temp.check_that(pg_temp.kind(public.auth_rate_limit('take', jsonb_build_array(pg_temp.rule('f:a', 2, 900)))) = 'allowed', 'a released attempt frees one place');
select public.auth_rate_limit('release', jsonb_build_array(pg_temp.rule('f:a', 2, 900)));
select public.auth_rate_limit('release', jsonb_build_array(pg_temp.rule('f:a', 2, 900)));
select public.auth_rate_limit('release', jsonb_build_array(pg_temp.rule('f:a', 2, 900)));
select pg_temp.check_that((select hits = 0 from public.auth_rate_counters
    where key = encode(sha256(convert_to('f:a', 'UTF8')), 'hex')), 'release stops at zero');
select public.auth_rate_limit('release', jsonb_build_array(pg_temp.rule('f:none', 2, 900)));
select pg_temp.check_that((select count(*) = 0 from public.auth_rate_counters
    where key = encode(sha256(convert_to('f:none', 'UTF8')), 'hex')), 'release creates no counter');

-- An expired window starts again at one hit.
update public.auth_rate_counters set reset_at = clock_timestamp() - interval '1 second'
where key = encode(sha256(convert_to('t:a', 'UTF8')), 'hex');
select pg_temp.check_that(pg_temp.kind(public.auth_rate_limit('take', jsonb_build_array(pg_temp.rule('t:a', 2, 900)))) = 'allowed', 'an expired window allows again');
select pg_temp.check_that((select hits = 1 and reset_at > clock_timestamp() from public.auth_rate_counters
    where key = encode(sha256(convert_to('t:a', 'UTF8')), 'hex')), 'an expired window restarts at one');

-- Expired counters are removed.
insert into public.auth_rate_counters (key, hits, reset_at)
select encode(sha256(convert_to('old:' || n, 'UTF8')), 'hex'), 3, clock_timestamp() - interval '1 hour' from generate_series(1, 5) as n;
select public.auth_rate_limit('take', jsonb_build_array(pg_temp.rule('f:b', 2, 900)));
select pg_temp.check_that((select count(*) = 0 from public.auth_rate_counters where reset_at <= clock_timestamp()), 'expired counters are purged');

-- Bad input is refused.
do $$ begin
    begin perform public.auth_rate_limit('drop', jsonb_build_array(pg_temp.rule('x', 1, 1)));
        raise exception 'unknown mode accepted';
    exception when raise_exception then
        if sqlerrm = 'unknown mode accepted' then raise; end if;
    end;
    begin perform public.auth_rate_limit('take', jsonb_build_array(jsonb_build_object('key', 'ana@example.com', 'limit', 1, 'window_seconds', 60)));
        raise exception 'raw key accepted';
    exception when raise_exception then
        if sqlerrm = 'raw key accepted' then raise; end if;
    end;
    begin perform public.auth_rate_limit('take', jsonb_build_array(pg_temp.rule('x', 0, 60)));
        raise exception 'zero limit accepted';
    exception when raise_exception then
        if sqlerrm = 'zero limit accepted' then raise; end if;
    end;
    begin perform public.auth_rate_limit('take', '[]'::jsonb);
        raise exception 'empty rules accepted';
    exception when raise_exception then
        if sqlerrm = 'empty rules accepted' then raise; end if;
    end;
end $$;
insert into checks values ('bad modes, raw keys, zero limits, and empty rules are refused');

-- Only the API's server role can reach the table or the function.
select pg_temp.check_that(not has_function_privilege('anon', 'public.auth_rate_limit(text,jsonb)', 'execute'), 'anonymous clients cannot call the limiter');
select pg_temp.check_that(not has_function_privilege('authenticated', 'public.auth_rate_limit(text,jsonb)', 'execute'), 'user tokens cannot call the limiter');
select pg_temp.check_that(has_function_privilege('service_role', 'public.auth_rate_limit(text,jsonb)', 'execute'), 'server role can call the limiter');
select pg_temp.check_that(not has_table_privilege('authenticated', 'public.auth_rate_counters', 'select'), 'user tokens cannot read counters');
select pg_temp.check_that(not has_table_privilege('anon', 'public.auth_rate_counters', 'insert'), 'anonymous clients cannot write counters');

select count(*) as passed_database_checks from checks;
rollback;
