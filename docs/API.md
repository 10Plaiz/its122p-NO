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

`POST /api/auth/login` returns the caller's profile plus `access_token` and
`expires_at`, and sets the refresh token as a cookie (see
[Sessions](#sessions)). Failures share one shape:

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
  and record ownership `403` responses keep the session active. The refresh
  token never reaches the page; it is an `HttpOnly` cookie.
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
3. `requireAuth` attaches `req.user = { id, name, email, role }` plus the
   caller's residency facts, and refuses a deactivated account with `403`.
4. `requireRole("admin")` gates whatever comes after it. `requireResidency`
   refuses a locked Citizen, and `requireApprovedResidency` refuses new reports
   and report photos from a Citizen whose proof is not yet approved. [Roles and permissions](#roles-and-permissions)
   lists which gate protects each capability.

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

### Sessions

Sign-in, the signup code, and refresh set the refresh token as the
`kamoti_refresh` cookie: `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`,
`Secure` over HTTPS, for 7 days. The JSON body carries `access_token` and
`expires_at` only, so a script injected into the page cannot read the refresh
token.

- `POST /api/auth/refresh` reads the cookie and must carry the header
  `X-KAMOTI-Session: 1`, which another site cannot send. It returns a new
  session and replaces the cookie, because Supabase rotates refresh tokens. A
  missing or refused token answers `401` and clears the cookie.
- `POST /api/auth/logout` reads the cookie, ends the session even when the
  access token has expired, and clears the cookie.
- Only the cookie counts: a `refresh_token` in the body is ignored by both
  routes (#71). A browser still holding a token stored before the cookie existed
  signs in again; the page deletes that old copy when it loads.

Sign-in failures are limited three ways in 15 minutes: 10 for one address from
one client, 30 from one client, and 20 for one address from any client. The
last one lets a stranger lock an address for up to 15 minutes; the owner can
still reset the password by code. Code requests (`/resend-code`,
`/forgot-password`) answer `204` even when Supabase withholds the email for an
address it recently sent to, so the answer never reveals whether an account
exists.

### Account rate limits

| Route | Limit | Counts |
| :--- | :--- | :--- |
| `/login` | 30 per client, 10 per address and client, 20 per address, in 15 minutes | Failures |
| `/verify-email`, `/reset-password` | 10 per client in 15 minutes | Failures |
| `/register` | 5 per client an hour | Every request |
| `/resend-code`, `/forgot-password` | 5 per client in 15 minutes | Every request |
| `/refresh`, `/logout` | 60 per client in 15 minutes | Every request |
| `/reports/:id/remarks` | 10 per Citizen an hour; Staff and Administrators are not limited | Every request |

Every API instance counts in the same database table, `auth_rate_counters`,
through the service-only `auth_rate_limit()` function. Keys are SHA-256 hashes
of the limit and its subject, so the table holds no email or address in the
clear. Each attempt is counted before the route runs, so a burst of parallel
guesses is counted in full. Where only failures count, a success, a server
fault, or a Supabase `429` gives its hit back before the response is sent.
A limited request answers `429` with `Retry-After`. If the database cannot be
reached, the request answers `503` with `Retry-After: 60` and
`code: rate_limit_unavailable`, and the route does not run.

Deploy `20261015000100_auth_rate_limits.sql` before the API that uses it. The
earlier API ignores the new table. Without the migration, the new API answers
`503` on every limited route, including sign-in. To roll back the API alone,
redeploy the earlier build; the table can stay.

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

A name or address change sends pending or verified residency back to pending,
with one exception (#67, owner 2026-10-15): when an Administrator corrects only
the name through `PATCH /api/admin/users/:id`, the decision stays as it is and
the `user.updated` audit records `residency_kept: "verified"`. The Citizen's own
name change still returns to review, because the approval checked the name on
the document. A rejected proof stays rejected until the Citizen submits a new
proof. The database applies these rules to the current row. A profile pre-read
cannot clear a newer decision. Contact-number changes still clear phone
verification.

`admin_change_profile` marks its own update with the transaction-local setting
`kamoti.residency_actor = 'admin'` and clears it right after; the
`version_residency_review` trigger reads it. Apply
`20261015000300_admin_name_corrections.sql` before or with the matching API;
the API's request does not change, so either order is safe.

`GET /api/admin/users/:id` returns the current account snapshot. Proof access
requires its displayed version:

```text
GET /api/admin/users/:id/residency-proof?expected_version=<UUID>
```

The response includes the signed URL, file kind, five-minute expiry, proof ID,
and review version. The required access audit identifies that exact proof and
version. An older version receives `409` and no signed URL.

`PATCH /api/admin/users/:id/residency` requires `expected_version` with the
decision. An approval names its basis (#63, owner decisions 2026-10-15):

| Decision | Body | Rule |
| :--- | :--- | :--- |
| Accept the document | `decision: "verified"`, `method: "document"`, `checks: ["name", "address", "readable", "document"]` | A current proof exists, and all four checks are present: the name matches, the address is in Makati and matches the account, the document is readable, and it is an accepted document within its date rule. No `note` |
| Approve without a document | `decision: "verified"`, `method: "no_document"`, `note` of 5 to 500 characters | The recorded exception, with or without an uploaded proof. The reason stays in the audit; the Citizen never sees it. No `checks` |
| Reject | `decision: "rejected"`, `note` of 5 to 500 characters | Needs a proof. The Citizen reads the reason. No `method` or `checks` |

Accepted documents: a utility bill from the last 3 months, a barangay
certificate or clearance, a lease, or a government ID with a Makati address.
An approval with no basis, or a body that breaks these rules, receives `400`
and changes nothing. The API and the database function both enforce the rules.

The database locks the profile before it compares the version. It saves one
decision, one notification, and the required audit in one transaction. The audit
records the inspected version, proof identity, relevant account details, and
the decision basis: `method`, `checks`, and `exception_reason`. A stale or
repeated request receives `409` with a refresh instruction. It changes no
residency state and adds no decision audit or notification.

Apply `20261015000200_residency_review_evidence.sql` right before deploying the
matching API. Until that API is live, approvals from the earlier API, which
sends no `method`, receive `400`; rejections keep working.

Before anything is stored, the server checks the whole file
(`src/server/lib/proof-files.ts`, #62). It refuses a bad file with `400` on the
`proof` field, so the current proof, status, and review stay as they were.
- JPEG, PNG, and WebP are decoded in full with `sharp`, up to 40 megapixels, first
  frame only. A truncated or corrupt image, or one whose real format differs
  from its declared type, is refused. Size is read from the header first, so an
  oversized image is refused before any decoding.
- A PDF must end with `startxref` pointing at a real cross-reference table and
  `%%EOF`, and must open with PDF.js (`stopAtErrors`) within 20 pages.
  Password-protected PDFs, and PDFs with JavaScript, embedded files, launch
  actions, rich media, or XFA forms, are refused, and the Citizen is asked for a
  plain scan or photo.
- The time limit is 5 seconds. For images, `sharp` passes it to libvips, which
  stops decoding itself. For PDFs, PDF.js parses on the API's own thread, so a
  timer cannot interrupt it. The deadline is checked before each step instead,
  and no step starts after it passes. Each step is bounded by the 5 MB and
  20-page limits. A check of the largest image allowed took about 0.4 s
  locally. The 5 MB upload limit is unchanged.
- Tools (#62): `sharp` (Apache-2.0, libvips, supported on Vercel) and Mozilla's
  `pdfjs-dist` (Apache-2.0), both maintained. `pdf-lib` was not used because it
  has had no release since 2022. `mupdf` was not used because it is AGPL. Both
  checks run inside the API; no document leaves it for an outside service.

These checks establish only that the file is a complete image or a plain PDF.
They are not a malware scan, and they do not show whose document it is or that
the address is in Makati. An Administrator still judges that in review.
Administrators open a PDF through its five-minute signed link in a new tab on
the Storage domain, never embedded in KAMOTI. Proofs stored before #62 were not
rechecked.

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

Replaced proofs stay private and keep their original bytes until
[Proof retention](#proof-retention) removes them 30 days later. Existing signed
links remain tied to their original document until their five-minute expiry.

### Deploy the review contract

The migration owner applies these files in order after review:

1. `20261006000100_residency_review_versions.sql`
2. `20261006000200_proof_retry_admission.sql`

`20261015000100_auth_rate_limits.sql` follows its own order; see
[Account rate limits](#account-rate-limits).

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

## Roles and permissions

This section is the single reference for what each role may do. Other guides
link here instead of repeating it. Navigation only hides links; the server
enforces every row below.

| Role | Created by | Notes |
| :--- | :--- | :--- |
| Anonymous | — | Not signed in |
| Citizen | Public registration and a six-digit email code | Residency decides whether the account is locked |
| Staff | An Administrator | Works only on reports assigned to them |
| Administrator | An Administrator, or the [one-time bootstrap](#making-the-first-admin) | Sees and manages everything |

A Citizen is **locked** while they have no proof, or their proof was rejected.
They are **unlocked** while a proof waits for review (pending) and after an
Administrator verifies them. Only a **verified** Citizen may file a new report
or add a report photo (#59, owner decision of 2026-10-05). A pending Citizen
gets `403 residency_pending` for those two actions and keeps every other
unlocked permission. Uploading a new proof or changing the address returns a
verified Citizen to pending. Staff and Administrators are never locked. A
deactivated account of any role receives `403` on every protected route, and
its next refresh ends the session.

| Capability | Anonymous | Citizen, locked | Citizen, unlocked | Staff | Administrator | Enforced by |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| View the public board, stats, and categories | Yes | Yes | Yes | Yes | Yes | No guard; `public_reports` view |
| Register, confirm email, request codes, reset password, sign in | Yes | — | — | — | — | Rate limits in `rate-limit.ts`; see [Sessions](#sessions) |
| Refresh the session, sign out | — | Yes | Yes | Yes | Yes | Refresh cookie; `/refresh` also needs `X-KAMOTI-Session` |
| Read own account | — | Yes | Yes | Yes | Yes | `requireAuth` |
| Edit own name, number, and address | — | Yes | Yes | No | No | `requireRole("citizen")` |
| Upload proof of residency | — | Yes | Pending only | No | No | `requireRole("citizen")`; verified accounts may only retry a committed upload |
| File a report | — | No | Verified only | No | No | `requireResidency`, `requireRole("citizen")`, `requireApprovedResidency`, shared quota |
| List and view reports | — | No | Own | Assigned | All | `scopeReportQuery`, `assertCanView` |
| Edit or cancel a report | — | No | Own, while pending | No | No | `assertCanEdit` |
| Add a report photo | — | No | Own, while pending; verified only | Assigned | Any | Photo route, `assertResidencyApproved`, `assertCanUpdate`, shared quota |
| Comment on a report | — | No | Own, 10 an hour | Assigned | Any | `requireRole`, `limits.citizenComment` |
| Change status (up to `in_progress`) | — | No | No | Assigned | Any | `requireRole("admin", "staff")`, `assertCanUpdate` |
| Assign a report | — | No | No | No | Yes | `requireRole("admin")` |
| Request resolution or rejection | — | No | No | Assigned | No | `requireRole("staff")`, closure RPC |
| Approve or return a closure request | — | No | No | No | Not their own request | `requireRole("admin")`, closure RPC |
| Rate a resolved report | — | No | Own, once | No | No | `createFeedback` |
| Read a report's rating | — | No | Own | Assigned | Any | `assertCanView` |
| Read a Staff rating summary | — | No | No | Own | Any | `requireRole("staff", "admin")` |
| Read notifications | — | No | Own | Own | Own | `requireResidency`, owner filter |
| Export reports | — | No | Own | Assigned | All | `requireResidency`, `scopeReportQuery` |
| Export the activity log | — | No | No | No | Yes | `requireRole("admin")` |
| Manage accounts, review residency, verify phones, open proofs | — | No | No | No | Yes | `requireRole("admin")` on `/api/admin` |
| Set Staff areas and specializations; see assignment suggestions | — | No | No | No | Yes | `requireRole("admin")` on `/api/staff` |
| Manage categories | — | No | No | No | Yes | `requireRole("admin")` |
| View analytics and the activity log | — | No | No | No | Yes | `requireRole("admin")` |
| Purge expired photos of cancelled reports | — | No | No | No | Yes | `requireRole("admin")` on `/api/maintenance` |

The Send SMS Hook is called by Supabase Auth, not by a user. Only a request
signed with `SEND_SMS_HOOK_SECRET` gets past it.

**Approved, not built (#59).** The owner approved requiring Administrator
approval before a Citizen files reports or uploads report photos. Until #59 is
verified, a pending Citizen can still do both, as the table shows.

Accounts are closed, never deleted. Set `is_active = false` through
`PATCH /api/admin/users/:id`. Deleting a user under Supabase Authentication now
fails for anyone with a profile, because the foreign key from `profiles` to
`auth.users` restricts deletes. That keeps their reports and audit trail.

[SECURITY.md](SECURITY.md) describes the controls behind these rules and the
accepted risks.

## API endpoints

| Method | Route | Who can call it |
| --- | --- | --- |
| `GET` | `/api/health` | anyone |
| `POST` | `/api/auth/register` | anyone: always creates a **citizen** |
| `POST` | `/api/auth/verify-email`, `/resend-code`, `/forgot-password`, `/reset-password` | anyone: validated, rate-limited account flows |
| `POST` | `/api/auth/refresh` | holder of the refresh cookie, with `X-KAMOTI-Session: 1`. See [Sessions](#sessions) |
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
| `POST` | `/api/reports/:id/photos` | owner while `pending` (initial); assigned staff or admin (resolution) |
| `GET` | `/api/notifications` (newest 50, and the count of every unread one), `/unread` (the count alone, for the menu badge) | signed in |
| `PATCH` | `/api/notifications/:id/read`, `/read-all` | owner |
| `GET` `POST` `PATCH` | `/api/admin/users[/:id]` | admin |
| `GET` | `/api/admin/users/:id/residency-proof` | admin; required access audit |
| `GET` | `/api/admin/users/:id` | admin; current account and review snapshot |
| `PATCH` | `/api/admin/users/:id/residency`, `/phone-verified` | admin |
| `GET` | `/api/staff` | admin: ranked assignment choices |
| `GET` `PUT` | `/api/staff/:id/areas`, `/api/staff/:id/specializations` | admin |
| `GET` `POST` | `/api/feedback/:reportId` | authorized reader; only the reporting Citizen can rate a resolved report, once |
| `GET` | `/api/feedback/summary/staff` | Staff's own summary; admin may select any Staff |
| `GET` | `/api/exports/reports`, `/api/exports/logs` | role-scoped reports; admin-only logs. See [Exports](#exports) |
| `GET` | `/api/admin/analytics` | admin |
| `GET` | `/api/admin/logs` | admin |
| `POST` | `/api/maintenance/purge-cancelled-photos` | admin. See [Photo retention](#photo-retention) |
| `POST` | `/api/maintenance/purge-expired-proofs` | admin. See [Proof retention](#proof-retention) |
| `POST` | `/api/hooks/send-sms` | Supabase Auth only, signed. Dormant. See [Send SMS Hook](#send-sms-hook) |
| `GET` | `/api/public/reports` | **anyone, no login** |
| `GET` | `/api/public/stats` | **anyone, no login**: counts above the board |

`GET /api/reports` filters by role: Citizens see their own reports, Staff see
assigned reports, and Administrators see all. Query parameters are `q`, `status`,
`category_id`, `barangay`, `from`, `to`, `sort`, `page`, and `per_page`. Besides
the stored statuses, `status=awaiting_verification` returns reports under review
or in progress whose closure request no Administrator has decided. Those reports
also still match their own status (#82). The public
route accepts the same filters, with status limited to `under_review`,
`in_progress`, `resolved`, and `rejected`. Both lists, and the report export,
sort by report `id` after the chosen `sort`, so reports that share a time or
status keep one order and no report repeats or goes missing across pages (#78).

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

## Exports

`GET /api/exports/reports` accepts the same filters as `GET /api/reports` plus
`format` (`csv` or `pdf`), and applies the same role scope.
`GET /api/exports/logs` accepts the activity-log filters and `format`. Both
return JSON rows; the browser builds the CSV or PDF file. Each export reads at
most 5,000 rows, in chunks of 1,000. The response carries `total`, `capped`, and
`limit`, so the screen can say when rows were left out. Each export is recorded
in the activity log.

## Photo retention

Rows are never deleted. Photo files of reports cancelled more than 90 days ago
are removed from Storage, and their photo rows are stamped with `purged_at`.
The report then shows that a photo was removed after the retention period.

`POST /api/maintenance/purge-cancelled-photos` takes an optional
`{ "dry_run": true }`. It returns `{ result }` with `dry_run`,
`retention_days`, `cutoff`, `reports`, `photos`, `purged`, and `failed`. Files
are removed in batches of 100. A failed batch returns `500` with the same
counts. Run the purge again to finish; purged photos are skipped. Every run is
recorded as `maintenance.photos_purged`. An Administrator starts it from the
dashboard's Photo retention panel. No scheduled job runs it.

## Proof retention

Owner decision (#70, 2026-10-15): a residency proof file is kept 30 days after
it stops being current. Rows are never deleted. The database owns the rule:
`expired_residency_proof_files()` lists the files,
`record_residency_proof_files_removed()` records removals in database time, and
a check constraint and the proof-version guard refuse to record a removal early.

| File | Removed | Recorded |
| :--- | :--- | :--- |
| A replaced proof | 30 days after `superseded_at` | `residency_proof_versions.file_removed_at`, set once |
| A stored file no proof record points to: an upload that never reached an account (a failed or uncertain attachment), or a file replaced before proof records began on 6 October 2026 | 30 days after the object was created | No row exists; counted in the audit as `unattached` |
| An account's current proof | Never | The guard refuses it |

`complete_residency_proof` refuses to attach a file stored more than 29 days
earlier (`409`, "Upload the proof again as a new submission"). A file the cleanup
has listed is at least 30 days old, so it can never become a current proof
between the listing and its removal. An exact retry of a committed upload is
unaffected. Signed links are issued only for the current proof and last five
minutes, so no open link points at a listed file. The decision and access
audits keep every proof's identity and path for good.

`POST /api/maintenance/purge-expired-proofs` takes an optional
`{ "dry_run": true }`. It returns `{ result }` with `dry_run`,
`retention_days`, `replaced`, `unattached`, `removed`, `recorded`, `failed`, and
`more`. Before any file goes, the run is recorded as
`maintenance.proofs_purged` with `phase: "started"` and the listed counts; that
audit is required, and if it fails nothing is removed (`503`). Files then go in
batches of 100, and each batch's replaced proofs are recorded. A failed batch
returns `500` with the counts so far; `removed` includes files that went even if
recording them failed. Run it again to finish: removing a missing file is a
no-op and recorded proofs are skipped. One run handles up to 1,000 files of
each kind; `more` says to run it again. The outcome is recorded with
`phase: "finished"` (or `"checked"` for a dry run). An Administrator starts it
from the dashboard's Proof retention panel. No scheduled job runs it.

Apply `20261015000400_proof_retention.sql` after #67's `20261015000300`, then
deploy the matching API. The earlier API never calls the new functions.

## Send SMS Hook

Phone verification by text message is deferred because there is no SMS
budget. Administrators mark numbers verified instead. The hook remains in place
for a future gateway:

- Supabase Auth calls `POST /api/hooks/send-sms` with a Standard Webhooks
  signature. The route reads the raw body before JSON parsing, because the
  signature covers the exact bytes.
- Without `SEND_SMS_HOOK_SECRET` it answers `500`. A missing or invalid
  signature answers `401`. A payload with no phone or code answers `400`.
- `SMS_PROVIDER` picks the gateway from `PROVIDERS` in `src/server/lib/sms.ts`.
  Only `none` exists, which answers `501`. An unknown name answers `500`.
  `SMS_API_KEY` is reserved for the future gateway.
- Errors use the body shape Supabase expects:
  `{ "error": { "http_code", "message" } }`.

The hook URL and secret are not set on the shared project. Turning text
codes on later needs a gateway in `PROVIDERS`, a phone-change start with the
user's own token, `verifyOtp` with type `phone_change` (ending the extra
session it opens), `[auth.sms] enable_confirmations`, and the hook URL and
secret on the project.

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
- Phone codes by text message ([Send SMS Hook](#send-sms-hook) is dormant)
- Administrator approval before reporting (#59)
- Self-service email address changes, for any role
- Self-service detail changes for Staff and Administrators; an Administrator edits them on Users
- A screen to add or retire problem types; they are seeded by migration
- Automatic assignment; the Assign dialog only ranks Staff
- A scheduled photo purge; an Administrator starts it from the dashboard
