# API guide

Express REST API for KAMOTI (Key Alert and Monitoring for Online Tracking of Infrastructures).
Data lives in Supabase. Every endpoint below is used by the React app and can
also be exercised with `curl` or Postman.

---

## API used

KAMOTI builds one API. The browser calls that API, Google Maps and Places,
Nominatim, and public report-photo URLs.

| API | Provider | Kind | Authentication |
| :--- | :--- | :--- | :--- |
| **KAMOTI REST API** | Built by the team: Express 5 on Node.js, TypeScript | First-party, internal | Supabase Auth bearer token |
| **Supabase**: Auth, Data API, Storage | Supabase Inc. | Third-party platform | Publishable key for sign-in; secret key server-only |
| **Nominatim reverse geocoding** | OpenStreetMap Foundation | Third-party, public, free | None: governed by a usage policy |
| **Google Maps JavaScript and Places** | Google | Third-party maps and place search | Browser key restricted by referrer and API |

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
reached through the Data API, holds application records. *Storage* holds public
report photos and private residency proofs in separate buckets.

**Nominatim** turns the coordinates of a dropped pin into a readable address, so
a citizen standing next to a broken drain does not have to type where they are
and the crew sent to fix it gets a street name rather than two decimal numbers.

**Google Maps** supplies the map imagery and markers. Places supplies location
search. The browser and API check report pins against the Makati boundary.

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
paging. The view also includes `barangay` and `rejection_reason`. Approved
rejection reasons are public, so staff must exclude personal information from
them. The `public_reports` view omits citizen identity and contact columns.
It includes only published reports and excludes cancelled reports. The
application keeps pending reports unpublished. Report text remains user-entered
content; the view does not remove personal information entered in that text.

`POST /api/auth/login` returns the caller's profile plus `access_token`,
`refresh_token` and `expires_at`. Failures share one shape:

```json
{
  "error": "Some fields are invalid. Fix them and try again.",
  "details": [{ "field": "email", "message": "Enter a valid email address." }]
}
```

`400` invalid input · `401` not signed in · `403` signed in but not allowed ·
`404` not found · `409` conflicting or already completed action · `429` rate
limit reached · `500` server fault.

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
- **Request pipeline.** Protected routers apply `requireAuth` and their role or
  residency gates. Routes validate fields with Zod and services check record
  ownership before their protected writes. Invalid fields return `400` with
  field messages. Public account routes also apply rate limits. See
  [How authentication works](#how-authentication-works).
- **Nominatim.** Called from `src/web/lib/maps.ts` as `reverseGeocode()`, used
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
migrations after review, normally after the pull request is merged. Other
contributors may inspect migration status but must not push feature-branch
migrations to the shared project.

For a **fresh project**, or after a reviewed migration is merged, the migration
owner runs:

```bash
bunx supabase db push --dry-run
# Confirm that only the expected migrations are listed, then:
bunx supabase db push
bunx supabase migration list
```

The owner confirms the project ref and exact dry-run list before applying
anything. Do not add `--include-seed`, reset the project, or repair migration
history to force a match. CI never runs `supabase db push`.

Apply the timestamped SQL files in `supabase/migrations/` in order.
The CLI tracks which migrations reached the linked project. The integration
adds account and residency fields, private proof storage, problem types,
closure review, rejected reports, immutable feedback, staff areas, and
transactional closure and account operations. A bounding-box database check
complements the API's more precise Makati polygon check. Existing report pins
are not backfilled or corrected automatically.

For PR #56, the owner approved applying the reviewed migrations before the
application merge. This exception requires a recoverable baseline and an
immediate check of the still-deployed `main`. It does not authorize seeding,
deleting records, changing photo retention, or pushing unrelated Auth settings.
A Git revert does not undo database or Auth changes. Database dumps contain
Storage metadata, but do not contain the stored file bytes.

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

Public registration collects name parts, email, password, barangay, address,
optional contact number, and privacy consent. It always creates a Citizen.
`POST /api/auth/register` starts signup without returning a session. The
application accepts a six-digit signup code at `/api/auth/verify-email` before
creating the application profile. Staff and Administrator accounts use the
Administrator account-management route.

New passwords require 8 to 72 characters, including an ASCII lowercase letter,
uppercase letter, digit, and punctuation character. A space or accented letter
does not satisfy the punctuation rule. Sign-in accepts existing passwords
without applying the new-password form validation.

The hosted Email provider, Confirm email, Secure email change, Secure password
change, and Require current password settings must be ON. Leaked-password
protection remains OFF under the team's free-plan choice. Forgot-password
recovery uses a valid, single-use recovery code. It does not ask for the forgotten
password. The API verifies the code's `recovery` purpose before its server-side
password update and global session sign-out. If the update fails after code
verification, that code has been consumed and a new one is required.

The confirmation and recovery templates in `supabase/templates/` contain
`{{ .Token }}`. Configure the hosted provider to send those templates with
six-digit codes and a one-hour expiry. Setting local `config.toml` does not
configure the hosted project. Supabase's default sender accepts only organization
members and currently allows two emails per hour. Free projects created after
3 June 2026 need custom SMTP to change their templates. See the
[SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp) and
[template restriction](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).
Do not mark real signup or recovery as verified until delivery and code use pass.

Account activity and role come from the current profile on each protected API
request. A deactivated account is refused. Citizens with no residency proof, or
rejected proof, can use their account, proof-upload and sign-out routes but cannot
use reporting, notifications, feedback, or exports. Uploading proof unlocks
those routes while an Administrator reviews it. Rejection locks them again.
This is the owner-confirmed team rule.

Residency proofs use the private `residency-proofs` bucket. Ordinary responses
expose a proof-present flag, not the object key. Administrators can request a
five-minute signed URL through the proof endpoint. The API must save its access
audit entry before returning the URL.

Administrator profile creation, role and activation changes, residency review,
and manual phone verification save their database change and audit entry in one
transaction. Auth account creation happens first through a separate service.
If its profile transaction fails, the Auth login can remain without application
access. Do not report that as a fully rolled-back account creation or delete it
automatically. Other application logs still use best-effort writes.

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

## Residency reviews

Each profile has a `residency_review_version` UUID. Each proof has an immutable
`residency_proof_id` UUID. The private `residency_proof_versions` table binds that
proof identity to its owner, object path, and content hash. Existing proofs keep
their paths and residency states after migration. Their content hashes remain
null because SQL cannot read the stored file bytes.

The review version changes when any of these values change:

- The proof identity or object path.
- The name, first name, middle name, last name, or suffix.
- The barangay or address line.
- The account role or active state.
- The residency decision, note, reviewer, or review time.

An identity or address change sends pending or verified residency back to
pending. A rejected proof stays rejected until the Citizen submits a new proof.
The database applies these rules to the current row. A profile pre-read cannot
clear a newer decision. Contact-number changes still clear phone verification.

`GET /api/admin/users/:id` returns the current account snapshot. Proof access
requires its displayed version:

```text
GET /api/admin/users/:id/residency-proof?expected_version=<UUID>
```

The response includes the signed URL, file kind, five-minute expiry, proof ID,
and review version. The required access audit identifies that exact proof and
version. An older version receives `409` and no signed URL.

`PATCH /api/admin/users/:id/residency` requires `expected_version` with the
decision and optional note. Approval without a document still requires that
version. The database locks the profile before it compares the version. It
saves one decision, one notification, and the required audit in one transaction.
The audit records the inspected version, proof identity, and relevant account
details. A stale or repeated request receives `409` with a refresh instruction.
It changes no residency state and adds no decision audit or notification.

`POST /api/auth/me/residency-proof` requires multipart fields `proof`,
`submission_id`, and `expected_version`. Use a new UUID for each selected file.
Keep that submission ID and expected version for retries of the same submission.
Send the same ID in the `submission_id` query parameter. The admission check
uses it before file parsing. A verified Citizen can retry an owned, committed
submission with a content hash. Other new uploads remain blocked after approval.
Every retry still counts toward the existing proof admission limits.
New objects use `<user-id>/<submission-id>.<extension>` with overwrite disabled.
The database attaches the object only if the expected review version still
matches and the object metadata exists. It also saves the upload audit.
An exact committed retry returns the current profile. It does not clear a later
decision or add another upload audit. Reusing an identity for different content
receives a conflict.

A failed upload leaves the current proof unchanged. A failed profile write
retains both objects. An uncertain response can mean that the database committed
the attachment. The API never deletes an object after such a response. An exact
retry resolves the result. Storage and PostgreSQL do not share a transaction.

An upload conflict blocks further submissions until the Citizen selects
**Refresh account**. Refresh keeps the selected file and loads the current
account into the proof form. It shows a current rejection without redirecting
and discarding that file. The Citizen checks the current address before sending
a new submission. A confirmed submission updates the signed-in account.
A failed refresh keeps the form blocked. A confirmed retry displays the current
residency result, including a later approval or rejection.

Replaced proofs stay private and keep their original bytes. Existing signed
links remain tied to their original document until their five-minute expiry.
This migration installs no automatic deletion. The proposed retention period is
30 days after replacement, subject to an owner-approved rule. That rule must
cover audit needs, active signed links, uncertain uploads, and removal failures.
Do not treat this proposal as approval for indefinite retention or deletion.

### Deploy the review contract

The migration owner applies these files in order after review:

1. `20261006000100_residency_review_versions.sql`
2. `20261006000200_proof_retry_admission.sql`

Pause proof uploads and account writes before migration. Let current requests
finish. Apply both migrations, deploy the matching API and web build, then
verify the review flow before you resume writes. The second migration reloads
the Data API schema cache. The earlier API can overwrite fixed proof paths
and cannot use the new version contract.

An application-only rollback is unsafe after this migration. The earlier API
does not send review versions and uses mutable proof paths. Prefer a compatible
forward fix. A database backup does not contain Storage file bytes.

## Citizen submission quotas

Reports, report photos, and residency proofs use the existing Supabase database
for shared quotas. One service-only `admit_citizen_operation` call checks the
Citizen account and network together. The check runs before multipart file
handling, report insertion, Storage writes, and submission notifications.
Verified Citizens have the same report and photo quotas as other eligible
Citizens. Existing residency, ownership, assignment, and role checks still apply.
Staff and Administrator photo uploads retain their existing permissions.

The owner agreed to proceed with this trial policy on 5 October 2026:

| Operation | Account attempts in the preceding 60 minutes | Network attempts in the preceding 60 minutes |
| :--- | ---: | ---: |
| Submit a report | 5 | 50 |
| Upload a report photo | 15 | 150 |
| Upload residency proof | 3 | 30 |

These are trial allowances, not measured capacity. Five reports allow several
distinct hazards in one session. Fifteen aggregate photo attempts are three
times the five-report allowance, leaving room for retries. They are not an
allocation of three attempts to each report. At the current 3 MiB file limit,
fifteen admitted photo uploads can contain at most 45 MiB of file data per
account in an hour. Three proof attempts allow an initial document and two
corrections. At the current 5 MiB file limit, those uploads can contain at
most 15 MiB per account in an hour. The network allowances let ten Citizens
each use their full account quota on one shared connection.
Actual Citizen demand, upload retries, shared-network size, and Staff review
capacity have not been measured. Hourly quotas also do not impose a daily
report ceiling.

OWASP recommends operation-specific request and payload limits based on
business needs. It does not prescribe these numbers. See its
[resource-consumption guidance](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/)
and [workflow-abuse guidance](https://api-security.owasp.org/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/).
Use observed legitimate peaks, review backlog, upload sizes, and quota refusals
to review the trial policy. Synthetic demo data does not establish demand.
The migration owns the thresholds, so running server instances use one policy.
Changing the policy requires a reviewed database migration.

A JSON report consumes a report attempt. A multipart report reserves both a
report attempt and a photo attempt, even if its body contains no photo. The
browser sends JSON when no photo is selected. This keeps photo-free reports
outside the photo quota. Every admitted attempt counts, including later field
validation, file validation, Storage failure, or interrupted uploads. A quota
refusal spends none of the requested allowances.

An exhausted quota returns `429` with an integer `Retry-After` header. JSON
details contain `code: citizen_submission_limited`, the operation,
`retry_after_seconds`, and `retry_at`. The browser shows a local retry time
and retains entered text and selected files while the page stays open. Retry
is manual. Existing report drafts retain text after reload. Files must be
selected again after a confirmed reload. A shared network can consume newly
available capacity before a Citizen retries.

Store errors, timeouts, missing migrations, and malformed RPC responses return
`503` with `Retry-After: 60` and `code: citizen_submission_unavailable`.
These requests reach no report, file, photo-row, or notification write.
There is no in-memory or unrestricted fallback. Admission has no automatic
retry. A lost response after the database commits can consume an attempt
without saving a report or file.

The ledger uses database time and transaction locks to enforce an exact
preceding-hour window across concurrent requests, process restarts, and server
instances. IPv6 addresses share a `/56` quota key. Local Node uses the socket
address. Only the Vercel runtime trusts its deployment proxy for client IPs.
No new service, credential, or paid plan is required. Indexed event rows and
RPC calls use the existing database allowance.

`citizen_submission_events` stores only operation, account or network identity,
and timing metadata. RLS and grants deny browser access to this table and both
quota functions. Each admission removes at most 256 expired events.
`purge_citizen_submission_events()` provides the same bounded cleanup for an
idle database. It never removes live quota events or application records.
Expired metadata remains until an admission or an owner-run cleanup occurs.

## API endpoints

| Method | Route | Who can call it |
| --- | --- | --- |
| `GET` | `/api/health` | anyone |
| `POST` | `/api/auth/register` | anyone: always creates a **citizen** |
| `POST` | `/api/auth/verify-email`, `/resend-code`, `/forgot-password`, `/reset-password` | anyone: validated, rate-limited account flows |
| `POST` | `/api/auth/refresh` | holder of a valid refresh token |
| `POST` | `/api/auth/login` | anyone |
| `POST` | `/api/auth/logout` | signed in: records the sign-out in the activity log |
| `GET` | `/api/auth/me` | signed in |
| `PATCH` | `/api/auth/me` | signed-in Citizen: own account fields |
| `POST` | `/api/auth/me/residency-proof` | signed-in Citizen: private proof upload |
| `GET` | `/api/categories` | anyone |
| `POST` `PATCH` `DELETE` | `/api/categories[/:id]` | admin; `DELETE` deactivates the category |
| `GET` | `/api/reports` | signed in: scoped by role |
| `POST` | `/api/reports` | citizen (multipart, optional `photo`, up to 3 MB) |
| `GET` | `/api/reports/:id` | owner, assigned staff, admin |
| `PATCH` | `/api/reports/:id` | owner, while `pending` |
| `POST` | `/api/reports/:id/cancel` | owner, while `pending` |
| `GET` | `/api/reports/:id/updates` | owner, assigned staff, admin |
| `GET` | `/api/reports/meta/problem-types` | signed in and residency-unlocked |
| `GET` | `/api/reports/:id/workflow` | owner, assigned staff, admin |
| `PATCH` | `/api/reports/:id/status` | assigned staff, admin |
| `PATCH` | `/api/reports/:id/assign` | **admin only** |
| `POST` | `/api/reports/:id/remarks` | reporting Citizen, assigned staff, admin |
| `POST` | `/api/reports/:id/closure-request` | assigned Staff |
| `POST` | `/api/reports/:id/closure-review` | admin; approval requires a different account from the requester |
| `POST` | `/api/reports/:id/photos` | owner (initial), assigned staff (resolution) |
| `GET` | `/api/notifications` | signed in |
| `PATCH` | `/api/notifications/:id/read`, `/read-all` | owner |
| `GET` `POST` `PATCH` | `/api/admin/users[/:id]` | admin |
| `GET` | `/api/admin/users/:id/residency-proof` | admin; required access audit |
| `GET` | `/api/admin/users/:id` | admin; current account and review snapshot |
| `PATCH` | `/api/admin/users/:id/residency`, `/phone-verified` | admin |
| `GET` | `/api/staff` | admin: ranked assignment choices |
| `GET` `PUT` | `/api/staff/:id/areas`, `/api/staff/:id/specializations` | admin |
| `GET` `POST` | `/api/feedback/:reportId` | authorized reader; only the reporting Citizen can rate a resolved report, once |
| `GET` | `/api/feedback/summary/staff` | Staff's own summary; admin may select any Staff |
| `GET` | `/api/exports/reports`, `/api/exports/logs` | role-scoped reports; admin-only logs |
| `GET` | `/api/admin/analytics` | admin |
| `GET` | `/api/admin/logs` | admin |
| `GET` | `/api/public/reports` | **anyone, no login** |
| `GET` | `/api/public/stats` | **anyone, no login**: counts above the board |

`GET /api/reports` filters by role: Citizens see their own reports, Staff see
assigned reports, and Administrators see all. Query parameters are `q`, `status`,
`category_id`, `barangay`, `from`, `to`, `sort`, `page`, and `per_page`. The public
route accepts the same filters, with status limited to `under_review`,
`in_progress`, `resolved`, and `rejected`.

Protected report-detail access (`GET /api/reports/:id` and `GET /api/reports/:id/updates`) enforces record-level authorization: a Citizen may only view their own report, Staff may only view a report assigned to them, and an Administrator may view any report. Unpermitted requests receive `403 Forbidden` and disclose no report data or timeline history. This contrasts with the public transparency board (`GET /api/public/reports`), which requires no sign-in and displays reviewed reports without reporter identity, contact numbers, pending or cancelled reports, protected history, or operational notes.

The third-party endpoint, called from the browser rather than from this API:

```
GET https://nominatim.openstreetmap.org/reverse
      ?format=jsonv2&lat=14.554700&lon=121.024400&zoom=18&addressdetails=1
```

## Status flow

```
pending -> under_review -> in_progress
pending -> cancelled                         (owner withdrawal)
in_progress -> resolved                      (closure approval)
under_review or in_progress -> rejected      (closure approval)
```

Status changes and assignments require a non-empty comment of up to 500
characters. Direct staff status changes stop at `in_progress`. For resolution,
assigned Staff must upload repair proof and request closure. They may request
rejection from `under_review` or `in_progress` with a reason. Both requests keep
the current status until Administrator review.

Closure review sends `decision`, `details`, and the unchanged `requested_at`
value from the displayed closure request. Approval requires an account different
from the requester, including when the requester has become an Administrator.
Returning a request keeps the status and clears the request for more work.
A replaced or already completed request returns `409`; reload before deciding.

The closure functions lock the report and save its change, history, audit entry,
and notifications in one transaction. Any failed required write rolls back that
closure action. They can be called only by `service_role`, through the authorized
API. Other status and assignment actions still use separate writes.

Approved rejection becomes `rejected` and publishes its reason. Resolution
sets `resolved_at`; rejection does not. Pending and cancelled reports remain
private. The public board does not expose citizen identities or private history.

While a report is still `pending` its owner may edit it (`PATCH /api/reports/:id`) or cancel it (`POST /api/reports/:id/cancel`). Once staff have picked it up, it is out of the citizen's hands: staff may already be acting on what it says. A cancelled report is kept, never deleted, so its history survives, and it never appears on the public board.

## Quick check

```bash
curl http://localhost:4000/api/health

curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Juan","last_name":"Dela Cruz","email":"juan@example.com","password":"Password123!","barangay":"Poblacion","address_line":"Synthetic test address","privacy_consent":true}'

# Read the emailed code, then confirm it before signing in.
curl -X POST http://localhost:4000/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@example.com","token":"<six-digit-code>"}'

curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@example.com","password":"Password123!"}'

curl -X POST http://localhost:4000/api/reports \
  -H "Authorization: Bearer <access_token>" \
  -F "title=Pothole on Rizal Street" \
  -F "description=Deep pothole near the corner, cars are swerving around it." \
  -F "category_id=1" \
  -F "primary_problem_id=<active-problem-id-from-meta-endpoint>" \
  -F "latitude=14.5547" \
  -F "longitude=121.0244" \
  -F "photo=@pothole.jpg"
```

`contact_number` is optional, and when given must be an 11-digit mobile number
starting `09`.

## Making the first admin

For a fresh project with no Administrator, the designated project owner must
review and perform the one-time bootstrap. Public registration cannot grant
that role. In an existing project, use its Administrator account-management
screen; do not run bootstrap SQL as a routine role change.

```sql
update profiles set role = 'admin' where email = 'you@example.com';
```

After that, create staff accounts through `POST /api/admin/users`.

## Not built yet

- Report-event email notifications (in-app only; Auth code emails are implemented)
- Inspection routes and screens for the `report_inspections` table
