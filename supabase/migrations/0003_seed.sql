-- KAMOTI — 0003_seed.sql
-- Baseline reference data. Safe to re-run.

insert into categories (name, description) values
    ('Road',        'Potholes, cracked pavement, damaged or missing road surface'),
    ('Streetlight', 'Broken, flickering, or unlit street lamps'),
    ('Drainage',    'Clogged canals, open manholes, flooding-prone drainage'),
    ('Signage',     'Damaged, faded, obstructed, or missing traffic signs'),
    ('Sidewalk',    'Broken or obstructed sidewalks and pedestrian crossings'),
    ('Other',       'Infrastructure issues that fit none of the categories above')
on conflict (name) do nothing;

-- Storage bucket for report photos. Objects are written by the API (service role);
-- reads are public so the transparency board can render them without a session.
insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do nothing;
