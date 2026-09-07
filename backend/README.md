# KAMOTI — Backend API

Express REST API for KAMOTI (Key Alert and Monitoring for Online Tracking of Infrastructures).
Data lives in Supabase. There is no frontend yet — every endpoint below can be exercised with `curl` or Postman.

## Setup

```bash
cd backend
npm install
cp .env.example .env      # then fill in your Supabase keys
npm run dev
```

Run the three SQL files in `../supabase/migrations/` in order (Supabase dashboard → SQL Editor) before starting the server.

## How authentication works

Supabase Auth owns passwords and issues the JWT. The API verifies that token and looks up the caller's row in `profiles` to learn their role.

1. `POST /api/auth/login` returns an `access_token`.
2. Send it on every protected request: `Authorization: Bearer <access_token>`.
3. `requireAuth` attaches `req.user = { id, name, email, role }`.
4. `requireRole("admin")` gates whatever comes after it.

The API holds the **service role key**, which bypasses Row Level Security. That means permission checks in `src/middleware/auth.js` and `src/services/reports.service.js` are the real gate; the RLS policies in `0002_rls.sql` are a second layer for anything that reaches Supabase directly.

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
| `POST` | `/api/reports` | citizen (multipart, optional `photo`) |
| `GET` | `/api/reports/:id` | owner, staff, admin |
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
```

One step at a time, no skipping and no going back. Enforced in `changeStatus()`. Each change writes a `report_updates` row and a notification for the citizen, and a report becomes visible on the public board once it leaves `pending`.

## Files

```
src/
├── app.js                       express app, route mounting
├── server.js                    starts it
├── config/
│   ├── env.js                   env vars, validated at boot
│   └── supabase.js              two clients: db (service) and auth (anon)
├── middleware/
│   ├── auth.js                  requireAuth, requireRole
│   └── error.js                 404 + central error handler
├── lib/
│   ├── errors.js                ApiError and helpers
│   ├── validate.js              zod → 400 with field messages
│   ├── photos.js                multer + Supabase Storage
│   └── activity.js              admin audit log
├── services/
│   └── reports.service.js       permissions, status flow, history, notifications
└── routes/
    ├── auth.routes.js
    ├── categories.routes.js
    ├── reports.routes.js
    ├── notifications.routes.js
    ├── admin.routes.js
    └── public.routes.js
```

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
