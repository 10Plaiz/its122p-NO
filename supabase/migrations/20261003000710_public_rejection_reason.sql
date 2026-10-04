-- KAMOTI: the public board shows why a report was rejected (SW-7)
--
-- Decision 2026-10-03: rejected reports stay on the transparency board with the
-- reason staff gave, which an administrator approved. Staff are told the reason is
-- public when they write it. Other closure reasons (the work done on a resolved
-- report) stay private, so the column is filled for rejected reports only.
--
-- `create or replace view` keeps the existing grants, but only allows new columns
-- at the END of the select list. Everything above rejection_reason is unchanged
-- from 20260918000006_public_reports_filters.sql.

create or replace view public_reports as
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
       r.resolved_at,
       coalesce(
           (select json_agg(json_build_object('kind', p.kind, 'storage_path', p.storage_path)
                            order by p.created_at)
            from report_photos p
            where p.report_id = r.id),
           '[]'::json
       ) as photos,
       r.category_id,
       case when r.status = 'rejected' then r.closure_reason end as rejection_reason
from reports r
join categories c on c.id = r.category_id
where r.is_public
  -- Belt and braces: a cancelled report is never public, but never publish one anyway.
  and r.status <> 'cancelled';
