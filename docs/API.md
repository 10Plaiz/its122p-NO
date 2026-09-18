# API guide

Express REST API for KAMOTI (Key Alert and Monitoring for Online Tracking of Infrastructures).
Data lives in Supabase. The current React page is a starter; every endpoint
below can also be exercised with `curl` or Postman.

## Setup

Bun manages dependencies and runs the project scripts. Node.js runs the API.
Use Bun 1.4 or newer and Node.js 22 or newer.

```bash
bun install
bunx supabase login
bunx supabase orgs list
bunx supabase projects create kamoti --org-id YOUR_ORG_ID --region YOUR_REGION
bunx supabase projects list
# Use the new project's ref:
bunx supabase link --project-ref YOUR_PROJECT_REF
bunx supabase db push --dry-run
# After reviewing the dry run:
bunx supabase db push
cp .env.example .env
# Fill in the URL, publishable key, and secret key in .env.
bun run dev
```

The five timestamped SQL files in `supabase/migrations/` are applied in order.
They create the schema, access rules, reference categories, photo bucket, and
inspection records. The CLI tracks which migrations have reached the linked
project. Use a fresh project for this baseline; an older database built from
earlier copies of the schema needs its history reconciled before `db push`.
Keep the secret key in the ignored local `.env` and add it separately to the
Vercel project's environment when deployment is ready.

The inspection table stores staff assessments, but inspection API routes and
screens are planned for Phase 3.

## How authentication works

Supabase Auth owns passwords and issues the JWT. The API verifies that token and looks up the caller's row in `profiles` to learn their role.

1. `POST /api/auth/login` returns an `access_token`.
2. Send it on every protected request: `Authorization: Bearer <access_token>`.
3. `requireAuth` attaches `req.user = { id, name, email, role }`.
4. `requireRole("admin")` gates whatever comes after it.

The API holds a **Supabase secret key**, which acts as the database
`service_role` and bypasses Row Level Security. Permission checks in
`src/server/middleware/auth.ts` and
`src/server/services/reports.service.ts` therefore enforce user access. The
API access migration prevents `anon` and `authenticated` database roles from
directly reading or writing protected application tables. Direct client reads
are limited to `categories` and the filtered `public_reports` view. Use the
Express endpoints for protected data; Supabase Auth still handles login.

To check these permissions on a disposable database after applying the migrations, run the regression test as the database owner:

```bash
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/api_access.sql
```

The test uses synthetic records inside a transaction and rolls them back.

## Endpoints

| Method | Route | Who can call it |
| --- | --- | --- |
| `GET` | `/api/health` | anyone |
| `POST` | `/api/auth/register` | anyone — always creates a **citizen** |
| `POST` | `/api/auth/login` | anyone |
| `GET` | `/api/auth/me` | signed in |
| `GET` | `/api/categories` | anyone |
| `POST` `PATCH` `DELETE` | `/api/categories[/:id]` | admin |
| `GET` | `/api/reports` | signed in — scoped by role |
| `POST` | `/api/reports` | citizen (multipart, optional `photo`, up to 3 MB) |
| `GET` | `/api/reports/:id` | owner, staff, admin |
| `PATCH` | `/api/reports/:id` | owner, while `pending` |
| `POST` | `/api/reports/:id/cancel` | owner, while `pending` |
| `GET` | `/api/reports/:id/updates` | owner, staff, admin |
| `PATCH` | `/api/reports/:id/status` | assigned staff, admin |
| `PATCH` | `/api/reports/:id/assign` | **admin only** |
| `POST` | `/api/reports/:id/remarks` | assigned staff, admin |
| `POST` | `/api/reports/:id/photos` | owner (initial), assigned staff (resolution) |
| `GET` | `/api/notifications` | signed in |
| `PATCH` | `/api/notifications/:id/read`, `/read-all` | owner |
| `GET` `POST` `PATCH` | `/api/admin/users[/:id]` | admin |
| `GET` | `/api/admin/analytics` | admin |
| `GET` | `/api/admin/logs` | admin |
| `GET` | `/api/public/reports` | **anyone, no login** |

`GET /api/reports` is a single handler that filters by role: a citizen sees only their own reports, a staff member sees only reports assigned to them, an admin sees all. Query parameters: `status`, `category_id`, `page`, `per_page`.

## Status flow

```
pending  →  under_review  →  in_progress  →  resolved
   ↓
cancelled          (citizen only, and only from pending)
```

One step at a time, no skipping and no going back. Enforced in `changeStatus()`. Each change writes a `report_updates` row and a notification for the citizen, and a report becomes visible on the public board once it leaves `pending`.

While a report is still `pending` its owner may edit it (`PATCH /api/reports/:id`) or cancel it (`POST /api/reports/:id/cancel`). Once staff have picked it up, it is out of the citizen's hands — staff may already be acting on what it says. A cancelled report is kept, never deleted, so its history survives, and it never appears on the public board.

## Quick check

```bash
curl http://localhost:4000/api/health

curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Juan Dela Cruz","email":"juan@example.com","password":"password123"}'

curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@example.com","password":"password123"}'

curl -X POST http://localhost:4000/api/reports \
  -H "Authorization: Bearer <access_token>" \
  -F "title=Pothole on Rizal Street" \
  -F "description=Deep pothole near the corner, cars are swerving around it." \
  -F "category_id=1" \
  -F "latitude=14.5547" \
  -F "longitude=121.0244" \
  -F "photo=@pothole.jpg"
```

## Making the first admin

Public registration always produces a citizen, so promote yourself once directly in Supabase:

```sql
update profiles set role = 'admin' where email = 'you@example.com';
```

After that, create staff accounts through `POST /api/admin/users`.

## Not built yet

- Email notifications (in-app only for now; the proposal marks email optional)
- Password reset
- Rate limiting on login
