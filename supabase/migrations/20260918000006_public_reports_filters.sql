-- KAMOTI: let the public board filter by category
--
-- The board exposes a category dropdown, but the view only carried the category
-- *name*, so the API had to match on a display string. Adding the id lets the board
-- filter on the same value GET /api/categories returns.
--
-- `create or replace view` keeps the existing grants from 20260918000001_schema.sql
-- and 20260918000004_api_access.sql, but it only allows new columns at the END of
-- the select list — hence category_id last rather than beside the name.

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
       r.category_id
from reports r
join categories c on c.id = r.category_id
where r.is_public
  -- Belt and braces: a cancelled report is never public, but never publish one anyway.
  and r.status <> 'cancelled';
