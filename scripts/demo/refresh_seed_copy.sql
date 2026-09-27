-- Run in the SQL editor of the documented presentation Supabase project.
-- Review the target and the preview query in docs/LOCAL_DEV.md before execution.
begin;

create temporary table seed_report_ids on commit drop as
select distinct entity_id::uuid as id
from activity_logs
where action = 'demo.report_seeded'
  and entity_type = 'report'
  and metadata->>'dataset' = 'makati-demo-v1';

create unique index on seed_report_ids (id);

create temporary table seed_profile_ids on commit drop as
select id
from auth.users
where raw_app_meta_data->>'demo_dataset' = 'makati-demo-v1';

create unique index on seed_profile_ids (id);

do $$
begin
  if (select count(*) from seed_report_ids) <> 150
    or (select count(*) from seed_report_ids s join reports r using (id)) <> 150
    or (select count(*) from seed_profile_ids) <> 36
    or (select count(*) from seed_profile_ids s join profiles p using (id)) <> 36
  then
    raise exception 'Makati seed markers or rows do not match the 150 reports and 36 accounts from PR 43';
  end if;
end;
$$;

update profiles p
set name = case p.name
  when 'Demo Makati Administrator' then 'Nina Valdez'
  when 'Demo Makati Staff 1' then 'Mariel Dela Cruz'
  when 'Demo Makati Staff 2' then 'Paolo Bautista'
  when 'Demo Makati Staff 3' then 'Liza Mercado'
  when 'Demo Makati Staff 4' then 'Ramon Flores'
  when 'Demo Makati Staff 5' then 'Celia Aquino'
  else substring(p.name from 6)
end
from seed_profile_ids s
where p.id = s.id
  and (p.name in ('Demo Makati Administrator', 'Demo Makati Staff 1',
                 'Demo Makati Staff 2', 'Demo Makati Staff 3',
                 'Demo Makati Staff 4', 'Demo Makati Staff 5')
       or (p.role = 'citizen' and p.name like 'Demo %'));

update reports r
set title = substring(r.title from 8)
from seed_report_ids s
where r.id = s.id and r.title like '[DEMO] %';

update reports r
set description = regexp_replace(
  regexp_replace(r.description, '^Synthetic Makati City demo example near [^:]+: ', ''),
  ' This record is illustrative and does not describe a verified incident[.]$', '')
from seed_report_ids s
where r.id = s.id
  and r.description ~ '^Synthetic Makati City demo example near [^:]+: '
  and r.description like '% This record is illustrative and does not describe a verified incident.';

update reports r
set address_text = left(r.address_text, -length(' (synthetic demo location)'))
from seed_report_ids s
where r.id = s.id and r.address_text like '% (synthetic demo location)';

-- Three older cancelled reports were created outside PR 43's seed. Their IDs
-- and original copy were checked on the linked project; edited values are skipped.
create temporary table older_demo_reports (id uuid primary key, old_title text, old_description text) on commit drop;
insert into older_demo_reports values
  ('706ad579-828c-4889-bc64-abf358912a22',
   '[DEMO] The gate does not work near Visita St. and Pablo Ocampo St.',
   'Synthetic Makati City demo example near Visita St. and Pablo Ocampo St.: The gate and its hinges are broken, rusted, and unusable. This record is illustrative and does not describe a verified incident.'),
  ('9d317e05-7a1e-47fc-916b-f4d615a0ab81',
   '[DEMO] Small pothole in EDSA',
   'Synthetic Makati City demo example near EDSA: A shallow pothole is growing on a lane and collects water after rain. This record is illustrative and does not describe a verified incident.'),
  ('cdadda9a-6b7c-4fbe-81a8-f147d7a346b3',
   '[DEMO] Small pothole near the intersection near Kingswood Makati',
   'Synthetic Makati City demo example near Kingswood Makati: A shallow pothole is growing at the edge of the lane and collects water after rain. This record is illustrative and does not describe a verified incident.');

update reports r
set title = substring(r.title from 8)
from older_demo_reports o
where r.id = o.id and r.title = o.old_title;

update reports r
set description = regexp_replace(
  regexp_replace(r.description, '^Synthetic Makati City demo example near [^:]+: ', ''),
  ' This record is illustrative and does not describe a verified incident[.]$', '')
from older_demo_reports o
where r.id = o.id and r.description = o.old_description;

update report_updates u
set details = case u.details
  when 'Assigned to staff-1.' then 'Assigned to Mariel Dela Cruz.'
  when 'Assigned to staff-2.' then 'Assigned to Paolo Bautista.'
  when 'Assigned to staff-3.' then 'Assigned to Liza Mercado.'
  when 'Assigned to staff-4.' then 'Assigned to Ramon Flores.'
  when 'Assigned to staff-5.' then 'Assigned to Celia Aquino.'
  when 'Reporter added a synthetic demo photo.' then 'Reporter added a photo of the issue.'
  when 'Resolution note: demo maintenance work has been completed and checked.' then 'Resolution note: maintenance work has been completed and checked.'
  when 'Demo inspection recorded; repair work is planned.' then 'Inspection recorded; repair work is planned.'
  when 'Staff added a synthetic demo resolution photo.' then 'Staff added a resolution photo after the repair.'
end
from seed_report_ids s
where u.report_id = s.id
  and u.details in (
    'Assigned to staff-1.', 'Assigned to staff-2.', 'Assigned to staff-3.',
    'Assigned to staff-4.', 'Assigned to staff-5.',
    'Reporter added a synthetic demo photo.',
    'Resolution note: demo maintenance work has been completed and checked.',
    'Demo inspection recorded; repair work is planned.',
    'Staff added a synthetic demo resolution photo.');

update notifications n
set message = replace(n.message, 'demo ', '')
from seed_report_ids s
where n.report_id = s.id
  and (n.message in (
         'A demo Makati report was assigned to you.',
         'Your demo report has been assigned to a staff member.',
         'A demo staff member added an inspection note to your report.')
       or n.message ~ '^A demo report near .+ was filed and is waiting for assignment[.]$'
       or n.message ~ '^Your demo report is now (under review|in progress|resolved)[.]$');

commit;
