# Source

Built from the attached local codebase folder **LAH** (KAMOTI — Key Alert and Monitoring for Online Tracking of Infrastructures). No GitHub repository is connected yet; the project association below records the local source.

source: local folder "LAH"
branch: n/a (local attachment)
path: backend/, supabase/, docs/

## Last sync

date: 2026-09-10T00:00:00Z
commit: unknown (local folder, no commit available)

### Updated in this project
- Read the Express API (auth, reports, categories, notifications, admin) and the Supabase schema.
- Wireframed 19 screens across public, citizen, staff and admin roles from the proposal + API.
- No frontend existed in the source, so nothing was recreated — the wireframes are the first screens.

## Screen map

| Screen (in KAMOTI Wireframes.dc.html) | Source files |
| --- | --- |
| 1a, 1b Submit a report | backend/src/routes/reports.routes.js (createSchema, POST /), backend/src/routes/categories.routes.js, supabase/migrations/0003_seed.sql |
| 1c, 1d, 1e Transparency board | backend/src/routes/public.routes.js, supabase/migrations/0001_schema.sql (public_reports view) |
| 1f Entry screen | docs/backend-explained.md, proposal PDF |
| 1g Sign in & register | backend/src/routes/auth.routes.js |
| 1h, 1i Citizen home | backend/src/routes/reports.routes.js (GET /, PATCH /:id, POST /:id/cancel), services/reports.service.js (assertCanEdit) |
| 1j Report detail & timeline | backend/src/routes/reports.routes.js (GET /:id, /:id/updates), services/reports.service.js (recordUpdate) |
| 1k Notifications | backend/src/routes/notifications.routes.js |
| 1l, 1m, 1n Staff queue & work view | services/reports.service.js (NEXT_STATUS, assertCanUpdate), routes/reports.routes.js (status, remarks, photos) |
| 1o Admin dashboard | backend/src/routes/admin.routes.js (GET /analytics) |
| 1p Admin all reports + assign | routes/reports.routes.js (PATCH /:id/assign), services/reports.service.js (assignStaff) |
| 1q Admin users | backend/src/routes/admin.routes.js (users) |
| 1r Admin categories | backend/src/routes/categories.routes.js, supabase/migrations/0003_seed.sql |
| 1s Admin activity log | backend/src/routes/admin.routes.js (GET /logs), supabase/migrations/0001_schema.sql (activity_logs) |
