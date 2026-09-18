# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

KAMOTI (Key Alert and Monitoring for Online Tracking of Infrastructures) — an ITS122 Group 4 final project: a citizen infrastructure-reporting system for an LGU. Three roles: `citizen`, `staff`, `admin`.

Only the backend exists. `backend/` is an Express 5 REST API over Supabase; `supabase/migrations/` is the schema. There is no frontend — every endpoint is exercised with curl/Postman. `Wireframe Screens Project/` holds design-canvas wireframes (`.dc.html`) for the not-yet-built UI.

## Commands

```bash
cd backend
npm install
cp .env.example .env      # fill in Supabase URL + anon + service role keys
npm run dev               # node --watch --env-file=.env src/server.js
npm start                 # no watch, no --env-file (expects real env vars)
```

There is no linter, no formatter, and no JS test runner. The only automated test is a SQL privilege regression run against a disposable database as its owner:

```bash
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/api_access.sql
```

Migrations are applied by hand in the Supabase dashboard SQL Editor, in numeric order (`0001_schema` → `0002_rls` → `0003_seed` → `0004_api_access`). There is no migration CLI here. On an existing database, never rerun `0001_schema.sql` — add a new numbered file instead.

Node >= 20.6.0 (the code relies on `--env-file` and Express 5 async error forwarding).

## Architecture

### Why the API exists at all

Express holds the Supabase **service role key**, which bypasses Row Level Security. Every permission decision therefore lives in JavaScript — `src/middleware/auth.js` and `src/services/reports.service.js` — not in the database. `0004_api_access.sql` revokes all direct table access from the `anon` and `authenticated` database roles, leaving them only `categories` and the `public_reports` view; `0002_rls.sql` policies are defense-in-depth behind that. So:

- A future frontend talks to Express for all protected data, and to Supabase directly only for login and those two public reads.
- Any new table needs an explicit `service_role` grant, or the API silently loses access to it.
- Forgetting an authorization check in a route is a real data leak, not a caught-by-RLS mistake.

Two Supabase clients in `src/config/supabase.js`: `db` (service key, every data read/write) and `auth` (anon key, used only by `POST /api/auth/login`).

### Request shape

`requireAuth` (verifies the bearer token, loads the `profiles` row into `req.user`, rejects deactivated accounts) → `requireRole(...)` → `parse(schema, source)` from `lib/validate.js` (zod → 400 with per-field details) → a service function or an inline `db` call → JSON.

Errors: throw `ApiError` via the `badRequest`/`unauthorized`/`forbidden`/`notFound` helpers. Wrap every Supabase call in `orThrow(result, "message")` — Supabase returns errors rather than throwing, and without `orThrow` a failed query is indistinguishable from an empty result. Express 5 forwards rejected promises from async handlers to `middleware/error.js`, so route handlers have no try/catch. Anything that is not an `ApiError` becomes a 500.

Error messages throughout are written for the end user, in plain language.

### The report lifecycle is the core domain rule

`NEXT_STATUS` in `services/reports.service.js` is the single source of truth:

```
pending → under_review → in_progress → resolved
   ↓
cancelled          (citizen only, and only while pending)
```

One step forward at a time; no skipping, no reversing. Side effects that hang off this:

- A report flips `is_public = true` the moment it leaves `pending` — that is what puts it on the login-free board. `cancelled` is forced back to `is_public = false` and the `public_reports` view excludes it twice over.
- `resolved_at` is set on resolve and is enforced by a CHECK constraint to match the status exactly.
- Every mutation goes through `recordUpdate()`, which writes a `report_updates` row and (when a message is given) a `notifications` row for the citizen. These are separate statements, not a transaction; if partial writes become a problem, move them into a Postgres function.
- A citizen may edit or cancel their own report only while it is `pending`. After that it belongs to staff. Cancelled rows are kept, never deleted.

Two distinct audit trails: `report_updates` is per-report history shown to participants; `activity_logs` is the system-wide admin log written by `logActivity()`, which deliberately swallows its own failures so logging can never break a request.

### Roles

Public registration always creates a `citizen` — the role is hard-coded, not read from the body. Staff and admins are created by an admin through `POST /api/admin/users`. The first admin is promoted by hand in SQL (`update profiles set role = 'admin' ...`). An admin cannot demote or deactivate themselves.

`GET /api/reports` is one handler filtered by role: citizen sees their own, staff sees what is assigned to them, admin sees everything.

### Photos

`lib/photos.js`: multer memory storage, one file, 5 MB, JPG/PNG/WebP only, pushed to the public `report-photos` Supabase Storage bucket. Only the object key (`storage_path`) is stored in `report_photos`. Public URLs are built at response time — `present()` in `reports.routes.js` and the equivalent mapping in `public.routes.js` — never persisted. `kind` is `initial` (citizen evidence, pending only) or `resolution` (assigned staff, proof of repair); the route infers it from whether the caller owns the report.

Multipart fields arrive as strings, so create/edit schemas use `z.coerce` for numbers.

## Conventions

ESM throughout (`"type": "module"`) — relative imports need the `.js` extension. Plain JavaScript, no TypeScript, no build step. Routes stay thin; anything involving permissions, the status machine, or history belongs in `services/reports.service.js`. `REPORT_FIELDS` is the one shared select string for reports — change it there, not per query. Existing comments explain *why* a decision was made rather than restating the code; match that.

## Reference docs

- `backend/README.md` — endpoint table, auth flow, setup, curl examples. Keep it current when routes change.
- `docs/backend-explained.md` — plain-language walkthrough written for presenting to the instructor.
- `docs/wireframe-api-review.md` — audit of the wireframes against the API, with a tiered list of known bugs and missing endpoints (unscoped `GET /api/reports/:id` for staff, unpaginated admin queries hitting Supabase's 1000-row cap, no token refresh, missing filter/sort/search params). Read this before adding features — it is the current backlog.
- Also not built: email notifications, password reset, login rate limiting.

Note: `.claude/skills/diagram-architect/` describes a different project (a milk bank system) and does not apply here.
