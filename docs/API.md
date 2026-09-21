# API guide

Express REST API for KAMOTI (Key Alert and Monitoring for Online Tracking of Infrastructures).
Data lives in Supabase. Every endpoint below is used by the React app and can
also be exercised with `curl` or Postman.

---

## API used

KAMOTI builds one API and consumes three. The browser only ever talks to two of
them directly: the KAMOTI API, and Nominatim.

| API | Provider | Kind | Authentication |
| :--- | :--- | :--- | :--- |
| **KAMOTI REST API** | Built by the team: Express 5 on Node.js, TypeScript | First-party, internal | Supabase Auth bearer token |
| **Supabase**: Auth, Data API, Storage | Supabase Inc. | Third-party platform | Publishable key for sign-in; secret key server-only |
| **Nominatim reverse geocoding** | OpenStreetMap Foundation | Third-party, public, free | None: governed by a usage policy |
| **OpenStreetMap raster tiles** | OpenStreetMap Foundation | Third-party, public, free | None: attribution required |

Supabase is reached **through** the KAMOTI API and never from the page, because
the key that reads protected data must not leave the server.

## API purpose

**KAMOTI REST API** carries every piece of application behaviour: registration
and sign-in, filing a report with a photo and a map pin, the staff queue and the
status workflow, admin account and category management, analytics, activity
logs, and the login-free public transparency board. It exists as its own layer
rather than letting the page query the database because permission decisions
have to happen somewhere the user cannot edit.

**Supabase** provides three services behind one project. *Auth* owns passwords
and issues the JWT, so the application never stores a password. *PostgreSQL*,
reached through the Data API, holds the eight application tables. *Storage*
holds report photos as files.

**Nominatim** turns the coordinates of a dropped pin into a readable address, so
a citizen standing next to a broken drain does not have to type where they are
and the crew sent to fix it gets a street name rather than two decimal numbers.

**OpenStreetMap tiles** are the map imagery under every pin.

## Data retrieved from the API

Every list endpoint returns the same envelope: rows under a named key, plus the
paging numbers needed to draw the pager. `GET /api/public/reports` returns:

```json
{
  "reports": [
    {
      "id": "8f3b1c22-0a77-4e51-9d2a-71c4e0b93f10",
      "reference_code": "KMT-2026-000042",
      "title": "Pothole on Rizal Street",
      "description": "Deep pothole near the corner, cars swerve around it.",
      "category": "Road",
      "category_id": 1,
      "latitude": 14.554700,
      "longitude": 121.024400,
      "address_text": "Rizal Street, Poblacion, Makati, Metro Manila",
      "status": "in_progress",
      "submitted_at": "2026-09-14T02:15:11.402Z",
      "resolved_at": null,
      "photos": [{ "kind": "initial", "storage_path": "8f3b1c22.../initial-4d07.jpg", "url": "https://<project>.supabase.co/storage/v1/object/public/report-photos/..." }]
    }
  ],
  "page": 1,
  "per_page": 50,
  "total": 47
}
```

`reference_code` is the number a citizen quotes. `address_text` is what
Nominatim supplied, still editable by the reporter. `total` is the count before
paging. **Absent by design:** no citizen id, name, email or contact number, and
no `pending` or `cancelled` report: this endpoint reads the `public_reports`
view, which cannot return those columns or rows at all.

`POST /api/auth/login` returns the caller's profile plus `access_token`,
`refresh_token` and `expires_at`. Failures share one shape:

```json
{
  "error": "Some fields are invalid. Fix them and try again.",
  "details": [{ "field": "email", "message": "Enter a valid email address." }]
}
```

`400` invalid input · `401` not signed in · `403` signed in but not allowed ·
`404` not found · `500` server fault.

From **Nominatim**, KAMOTI reads exactly one field of the response,
`display_name`, truncated to 255 characters.

## How the API is integrated into the website

- **One wrapper.** Every request goes through `src/web/lib/api.ts`, so the token
  header, query encoding and error shape are defined once rather than at each
  call site.
- **Relative URLs.** The browser calls `/api/...`, never an absolute host. Vite
  proxies that to Express on port 4000 in development; Vercel rewrites it to the
  Node function in production. The same build works in both because it never
  learns where the API is.
- **Token, not password.** The `access_token` is read from `localStorage` per
  request; a `401` or a deactivation `403` clears it and ends the session. Role
  and record ownership `403` responses keep the session active.
- **No page reloads.** Screens use `useApi` for reads, which tracks loading and
  error state and abandons superseded requests with `AbortController`. They use
  `useAction` for writes. Uploads send `FormData` with `Content-Type` left unset
  so the browser can write its own multipart boundary.
- **Request pipeline.** Each route validates with zod (`400` listing the exact
  fields, which is what draws the red text under a form control), then
  `requireAuth`, then `requireRole` and the finer service-level checks, and only
  then queries Supabase. That order is the security model: see
  [How authentication works](#how-authentication-works).
- **Nominatim.** Called from `src/web/lib/leaflet.ts` as `reverseGeocode()`, used
  by the report wizard. Debounced 1000 ms and throttled to start no more than
  one request per second, cancelled with `AbortController` when the pin moves
  again, and silent on failure: the address field stays empty and typeable, so a
  rate-limited lookup costs the citizen nothing. Every report can be filed
  without it.

The frozen Phase 3 write-up, with field tables and the request-pipeline diagram,
is in the [API documentation](API_Documentation.md). Use this guide for the
maintained contract.

---

## Local setup

The [local-development guide](LOCAL_DEV.md) owns prerequisites, environment
configuration, startup commands, and safety boundaries. The migration procedure
below remains here because it changes the API's database contract.

## Database migrations

Any contributor may add a migration to a feature branch, but the shared
Supabase project has one designated migration owner. Only that owner applies
migrations after the pull request has been reviewed and merged. Other
contributors may inspect migration status but must not push feature-branch
migrations to the shared project.

For a **fresh project**, or after a reviewed migration is merged, the migration
owner runs:

```bash
bunx supabase db push --dry-run
# Confirm that only the expected migrations are listed, then:
bunx supabase db push --skip-vault
bunx supabase migration list
```

The owner confirms the dry-run output before applying anything. The
`--skip-vault` flag keeps the command focused on SQL migrations. CI does not
receive Supabase secrets and never runs `supabase db push`.

The six timestamped SQL files in `supabase/migrations/` are applied in order.
They create the schema, access rules, reference categories, photo bucket,
inspection records, and the public board's category filter. The CLI tracks which
migrations have reached the linked project. Use a fresh project for this
baseline; an older database built from earlier copies of the schema needs its
history reconciled before `db push`.

Environment and credential safety rules belong to
[LOCAL_DEV.md](LOCAL_DEV.md#safety-boundaries).

The inspection table stores staff assessments, but no inspection API routes or
screens are implemented yet.

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

## API endpoints

| Method | Route | Who can call it |
| --- | --- | --- |
| `GET` | `/api/health` | anyone |
| `POST` | `/api/auth/register` | anyone: always creates a **citizen** |
| `POST` | `/api/auth/login` | anyone |
| `POST` | `/api/auth/logout` | signed in: records the sign-out in the activity log |
| `GET` | `/api/auth/me` | signed in |
| `GET` | `/api/categories` | anyone |
| `POST` `PATCH` `DELETE` | `/api/categories[/:id]` | admin |
| `GET` | `/api/reports` | signed in: scoped by role |
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
| `GET` | `/api/public/stats` | **anyone, no login**: counts above the board |

`GET /api/reports` is a single handler that filters by role: a citizen sees only their own reports, a staff member sees only reports assigned to them, an admin sees all. Query parameters: `q`, `status`, `category_id`, `from`, `to`, `sort`, `page`, `per_page`. `GET /api/public/reports` takes the same set, except that `status` accepts only the three the board can show.

The third-party endpoint, called from the browser rather than from this API:

```
GET https://nominatim.openstreetmap.org/reverse
      ?format=jsonv2&lat=14.554700&lon=121.024400&zoom=18&addressdetails=1
```

## Status flow

```
pending  →  under_review  →  in_progress  →  resolved
   ↓
cancelled          (citizen only, and only from pending)
```

One step at a time, no skipping and no going back. Enforced in `changeStatus()`. Each change writes a `report_updates` row and a notification for the citizen, and a report becomes visible on the public board once it leaves `pending`.

While a report is still `pending` its owner may edit it (`PATCH /api/reports/:id`) or cancel it (`POST /api/reports/:id/cancel`). Once staff have picked it up, it is out of the citizen's hands: staff may already be acting on what it says. A cancelled report is kept, never deleted, so its history survives, and it never appears on the public board.

## Quick check

```bash
curl http://localhost:4000/api/health

curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Juan Dela Cruz","email":"juan@example.com","password":"password123","contact_number":"09171234567"}'

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

`contact_number` is optional, and when given must be an 11-digit mobile number
starting `09`.

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
- Inspection routes and screens for the `report_inspections` table
