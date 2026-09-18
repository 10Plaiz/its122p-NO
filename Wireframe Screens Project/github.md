# Source

Built from the KAMOTI codebase (Key Alert and Monitoring for Online Tracking of
Infrastructures) in this repository.

source: https://github.com/10Plaiz/its122p-NO
branch: feat/docs-and-wireframes
path: src/server/, src/web/, supabase/, docs/

## Last sync

date: 2026-09-18T00:00:00Z
commit: 318f043

### Updated in this project
- Read the Express API (auth, reports, categories, notifications, admin) and the Supabase schema.
- Wireframed 19 screens across public, citizen, staff and admin roles from the proposal + API.
- No frontend existed in the source, so nothing was recreated — the wireframes are the first screens.
- Screen map repointed from the retired `backend/src/**/*.js` layout to `src/server/**/*.ts`,
  and from the `000N_*.sql` migration names to the timestamped ones.

## Screen map

| Screen (in KAMOTI Wireframes.dc.html) | Source files |
| --- | --- |
| 1a, 1b Submit a report | src/server/routes/reports.routes.ts (createSchema, POST /), src/server/routes/categories.routes.ts, supabase/migrations/20260918000003_reference_data.sql |
| 1c, 1d, 1e Transparency board | src/server/routes/public.routes.ts, supabase/migrations/20260918000001_schema.sql (public_reports view) |
| 1f Entry screen | docs/ARCHITECTURE.md, docs/Final_Project.md |
| 1g Sign in & register | src/server/routes/auth.routes.ts |
| 1h, 1i Citizen home | src/server/routes/reports.routes.ts (GET /, PATCH /:id, POST /:id/cancel), src/server/services/reports.service.ts (assertCanEdit) |
| 1j Report detail & timeline | src/server/routes/reports.routes.ts (GET /:id, /:id/updates), src/server/services/reports.service.ts (recordUpdate) |
| 1k Notifications | src/server/routes/notifications.routes.ts |
| 1l, 1m, 1n Staff queue & work view | src/server/services/reports.service.ts (NEXT_STATUS, assertCanUpdate), src/server/routes/reports.routes.ts (status, remarks, photos) |
| 1o Admin dashboard | src/server/routes/admin.routes.ts (GET /analytics) |
| 1p Admin all reports + assign | src/server/routes/reports.routes.ts (PATCH /:id/assign), src/server/services/reports.service.ts (assignStaff) |
| 1q Admin users | src/server/routes/admin.routes.ts (users) |
| 1r Admin categories | src/server/routes/categories.routes.ts, supabase/migrations/20260918000003_reference_data.sql |
| 1s Admin activity log | src/server/routes/admin.routes.ts (GET /logs), supabase/migrations/20260918000001_schema.sql (activity_logs) |
