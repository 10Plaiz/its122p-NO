-- KAMOTI: problem types per category (RS-2, RS-4)
--
-- A category says which crew a report belongs to; a problem type says what that
-- crew will find when it gets there. Each report records one main problem
-- (required for new reports) and optionally one other. The form only offers the
-- types of the category chosen, so a pothole can never be filed as a streetlight.
--
-- Reports filed before this migration keep both columns null. The API requires a
-- main problem on every new report; the database cannot, because of those rows.

begin;

create table public.problem_types (
    id          bigint generated always as identity primary key,
    category_id bigint  not null references public.categories (id) on delete restrict,
    name        text    not null check (length(btrim(name)) > 0),
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    constraint problem_types_category_name_key unique (category_id, name),
    -- Lets reports reference (problem, category) as a pair below.
    constraint problem_types_id_category_key unique (id, category_id)
);

create index problem_types_category_idx on public.problem_types (category_id) where is_active;

-- Matched by category name, the same names 20260918000003_reference_data.sql
-- seeds. A category that was renamed or never seeded simply gets no types here.
-- Safe to re-run.
insert into public.problem_types (category_id, name)
select c.id, v.name
from (values
    ('Road',        'Pothole'),
    ('Road',        'Cracked pavement'),
    ('Road',        'Sunken or uneven road'),
    ('Road',        'Faded road markings'),
    ('Road',        'Debris or obstruction on the road'),
    ('Streetlight', 'Lamp not working'),
    ('Streetlight', 'Flickering lamp'),
    ('Streetlight', 'Damaged or leaning pole'),
    ('Streetlight', 'Exposed wiring'),
    ('Streetlight', 'Lamp left on during the day'),
    ('Drainage',    'Clogged drain or canal'),
    ('Drainage',    'Open or missing manhole cover'),
    ('Drainage',    'Broken drain grate'),
    ('Drainage',    'Flooding after rain'),
    ('Drainage',    'Overflowing or foul-smelling drain'),
    ('Signage',     'Damaged or bent sign'),
    ('Signage',     'Faded or unreadable sign'),
    ('Signage',     'Missing sign'),
    ('Signage',     'Sign blocked from view'),
    ('Sidewalk',    'Broken or cracked sidewalk'),
    ('Sidewalk',    'Obstructed sidewalk'),
    ('Sidewalk',    'Uneven or raised slabs'),
    ('Sidewalk',    'Missing ramp or curb cut'),
    ('Sidewalk',    'Damaged pedestrian crossing'),
    ('Other',       'Damaged public structure'),
    ('Other',       'Safety hazard'),
    ('Other',       'Something else')
) as v (category, name)
join public.categories c on c.name = v.category
on conflict (category_id, name) do nothing;

-- Both foreign keys pair the problem with the report's own category, so a problem
-- of another category is refused by the database as well as by the API. A null
-- problem skips the check (MATCH SIMPLE), which is what legacy rows need. Changing
-- a report's category therefore means choosing its problems again in the same
-- update, which is what the edit endpoint requires.
alter table public.reports
    add column primary_problem_id   bigint,
    add column secondary_problem_id bigint,
    add constraint reports_primary_problem_fkey
        foreign key (primary_problem_id, category_id)
        references public.problem_types (id, category_id) on delete restrict,
    add constraint reports_secondary_problem_fkey
        foreign key (secondary_problem_id, category_id)
        references public.problem_types (id, category_id) on delete restrict,
    add constraint reports_problems_differ
        check (secondary_problem_id is null or secondary_problem_id <> primary_problem_id),
    add constraint reports_secondary_needs_primary
        check (secondary_problem_id is null or primary_problem_id is not null);

create index reports_primary_problem_idx
    on public.reports (primary_problem_id) where primary_problem_id is not null;
create index reports_secondary_problem_idx
    on public.reports (secondary_problem_id) where secondary_problem_id is not null;

alter table public.problem_types enable row level security;

-- Read through the API like every other protected table (20260918000004). Types
-- are retired with is_active, never deleted (DM-1), so no delete grant.
revoke all on table public.problem_types from public, anon, authenticated;
revoke all on sequence public.problem_types_id_seq from public, anon, authenticated;
grant select, insert, update on table public.problem_types to service_role;
grant usage, select on sequence public.problem_types_id_seq to service_role;

commit;
