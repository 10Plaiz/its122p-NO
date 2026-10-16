# Security review

The security write-up for requirement UA-10: the controls KAMOTI relies on,
the evidence for each one, and the risks the team has accepted. Each control
names its code so the review can be repeated. Roles and their permissions are
listed once, in [API.md](API.md#roles-and-permissions).

Checked against `main` at `64c5c26` on 15 October 2026.

Evidence labels:

| Label | Meaning |
| :--- | :--- |
| Source | Read in the code; covered by the fast suite (`bun run test`) where a test is named |
| Local | Passed on the local Supabase stack and recorded in `tests/evidence/` |
| Hosted | Passed on the shared Supabase project or the deployed site and recorded in a closed issue |

## Controls

### Authentication and sessions

| Control | Where | Evidence |
| :--- | :--- | :--- |
| Supabase Auth stores passwords and issues JWTs; the application never stores a password | `src/server/middleware/auth.ts` | Hosted (#50) |
| Every protected request re-reads the profile, so role, activation, and residency changes apply at once | `requireAuth` | Local (security IMP-14) |
| Public sign-up always creates a Citizen; only an Administrator creates Staff and Administrators | `auth.routes.ts`, `admin.accounts.ts` | Source (`tests/fast/accounts.test.ts`) |
| New passwords: 8 to 72 characters with lowercase, uppercase, digit, and punctuation | `passwordRule` in `src/server/lib/validate.ts` | Hosted (#50) |
| Signup and recovery use single-use six-digit email codes with a one-hour expiry | `accounts-email.ts`, `supabase/templates/` | Hosted (#50); Local (Mailpit, #52) |
| A password reset signs out every session | `resetPassword` | Hosted (#50) |
| The refresh token is an `HttpOnly`, `SameSite=Strict` cookie on `/api/auth`, so page scripts cannot read it; `/refresh` and `/logout` ignore a body token (KI-12, #71) | `src/server/lib/session-cookie.ts` | Source (`tests/fast/accounts-email.test.ts` ACC-13); Local (security IMP-16) |
| `/api/auth/refresh` needs the `X-KAMOTI-Session` header, which another site cannot send | `requireSessionHeader` | Source (ACC-13) |
| Sign-out revokes the session by refresh cookie, even after the access token expired | `/api/auth/logout` | Local (security IMP-10) |
| A deactivated account gets `403` on every route, at sign-in, and at refresh | `requireAuth`, `accounts-profile.ts` | Local (security IMP-14) |
| After 15 idle minutes a one-minute warning appears, then the browser signs out and keeps the report draft | `src/web/lib/idle.ts` | Source; browser session tests |
| An already-open signed-out tab adopts a new shared login only after fetching its authenticated profile and checking that the token is still current | `src/web/lib/auth.tsx` | Controlled browser regression (#86); shared refresh, idle activity, and sign-out scenarios |

### Authorization

| Control | Where | Evidence |
| :--- | :--- | :--- |
| Role gates on every protected router | `requireRole` | Local (security AUTHZ-11, AUTHZ-12); Source (`tests/fast/permissions.test.ts`) |
| Record checks: Citizens see their own reports, Staff their assigned ones, Administrators all | `src/server/services/reports.access.ts` | Local (AUTHZ-06 to AUTHZ-15) |
| Role scope is applied before any filter, so a filter can only narrow results | `scopeReportQuery`, also in exports | Source |
| Locked Citizens (no proof, or rejected) get `403 residency_required` | `requireResidency` | Local (IMP-01, IMP-15) |
| Citizens whose proof awaits review get `403 residency_pending` on new reports and report photos, before the quota is spent; they keep every action on reports filed earlier | `requireApprovedResidency`, `assertResidencyApproved` | Local (IMP-17, IMP-18); Source (`tests/fast/residency-approval.test.ts`) |
| Closure approval needs a different account from the requester | `review_report_closure` | Local (`tests/database/atomic-actions.sql`) |

### Database

| Control | Where | Evidence |
| :--- | :--- | :--- |
| `anon` and `authenticated` cannot read or write application tables; only `categories` and the `public_reports` view are readable | `20260918000004_api_access.sql` | Local (`supabase/tests/api_access.sql`); Hosted (4 October release) |
| `public_reports` leaves out reporter identity, contact columns, pending and cancelled reports | Latest definition in `20261003000800_area_routing.sql` | Hosted (4 October release) |
| Account, review, quota, and closure functions run only as `service_role` | Migrations from `20261004000100` on | Local (`atomic-actions.sql`) |
| Closures, privileged profile changes, and residency decisions save the change and their audit entry in one transaction | `request_report_closure`, `review_report_closure`, `admin_change_profile` | Local (`atomic-actions.sql`) |
| Rows are never deleted; foreign keys restrict deletes | `20261003000100_no_delete.sql` | Source (`tests/fast/no-delete.test.ts`) |
| Report pins must fall inside Makati: a polygon check in the API and a box check in the database | `src/server/lib/makati-boundary.ts`, `20261003000600_makati_bounds.sql` | Hosted (#49) |

### Files

| Control | Where | Evidence |
| :--- | :--- | :--- |
| Proofs go to the private `residency-proofs` bucket; responses carry only a proof-present flag | `src/server/lib/residency.ts` | Local (IMP-02); Hosted (#64: anonymous and Citizen tokens refused) |
| A proof file is removed 30 days after it stops being current (replaced, or no proof record points to it); attaching stops at 29 days, so a listed file never becomes current; an account's current proof is never removed; rows stay and record the removal; the run is audited before any file goes (#70) | `expired_residency_proof_files`, `residency_proof_versions.file_removed_at`, migration `20261015000400`; `src/server/lib/proof-retention.ts` | Local (`tests/database/proof-retention.sql`; dashboard run on real Storage, see `tests/evidence/issue70/`); Source (`tests/fast/proof-retention.test.ts`) |
| An Administrator opens a proof through a five-minute signed link, and the access audit is saved before the link is returned | `GET /api/admin/users/:id/residency-proof` | Local (IMP-03, IMP-12); Hosted (#64: `401`, `403`, stale `409` without an audit, one audit per link) |
| An approval records its basis: the uploaded document after four checks, or the no-document exception with a reason (#63) | `admin_change_profile`, migration `20261015000200` | Local (`tests/database/residency-review.sql`, security IMP-12) |
| A name or address change returns residency to review, except an Administrator's name-only correction, which keeps the decision and records `residency_kept` (#67) | `version_residency_review`, `admin_change_profile`, migration `20261015000300` | Local (`tests/database/name-corrections.sql`, security IMP-19) |
| A residency decision is bound to the proof and address version the Administrator saw | `residency_review_version`, `residency_proof_versions` | Local (`tests/evidence/issue61/verification.md`) |
| Proofs: JPG, PNG, WebP, or PDF up to 5 MB. Images fully decoded within 40 megapixels; PDFs need a complete trailer, open with PDF.js within 20 pages, and carry no password, scripts, or attachments; 5 s limit (libvips stops itself; PDF steps stop at the deadline); refused before storage | `proof-files.ts`, `residency.ts` | Local (IMP-17); Source (`tests/fast/proof-files.test.ts`, `tests/fast/residency-http.test.ts`) |
| Report photos: JPG, PNG, or WebP up to 3 MB, with the same first-byte check, before the report is saved | `checkPhoto` in `src/server/lib/photos.ts` | Source (`tests/fast/photos.test.ts`) |

### Abuse limits

| Control | Where | Evidence |
| :--- | :--- | :--- |
| Sign-in: 10 failures for one address from one client, 30 from one client, and 20 for one address from any client, in 15 minutes | `src/server/lib/rate-limit.ts` | Source (`tests/fast/rate-limit.test.ts`) |
| Account limits are shared by every API instance and count parallel bursts in full (KI-14) | `auth_rate_limit()`, `20261015000100_auth_rate_limits.sql` | Local (`tests/database/auth-rate-limits.sql`; two API processes refused the 11th failure) |
| Code requests answer `204` when Supabase withholds an email for a recent request, so they never reveal an account (KI-15) | `src/server/lib/accounts-email.ts` | Source (ACC-12) |
| Sign-up: 5 an hour per client. Code checks: 10 failures in 15 minutes. Code requests: 5 in 15 minutes. Refresh: 60 in 15 minutes | `rate-limit.ts` | Source |
| Citizen comments: 10 an hour per account | `limits.citizenComment` | Source |
| Shared quotas for reports, report photos, and proofs, per account and per network | `admit_citizen_operation`; [API.md](API.md#citizen-submission-quotas) | Local (`bun run test:submission-limits`) |

### Transport and headers

| Control | Where | Evidence |
| :--- | :--- | :--- |
| CORS allows one origin, `CORS_ORIGIN` | `src/server/app.ts` | Source |
| Express trusts one proxy hop only on Vercel, so clients cannot spoof their address locally | `app.ts`, [LOCAL_DEV.md](LOCAL_DEV.md#first-setup) | Source (`tests/fast/submission-limits.test.ts`) |
| The site sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin` | `vercel.json` | Source |
| An enforced Content-Security-Policy allows scripts only from the site and Google Maps, and forbids `eval`, plugins, framing, and other form targets | `vercel.json`; `src/web/public/zod-config.js` keeps Zod off `eval` | Local ([CSP check](../tests/evidence/csp-local-2026-10-15/report.md)) |
| The Google Maps key is restricted by referrer and API | Google Cloud | Hosted (#51) |
| The Send SMS Hook rejects any request not signed with its secret | `src/server/routes/hooks.routes.ts` | Source (`tests/fast/sms-hook.test.ts`) |

## Accepted risks

KI numbers refer to the known-issues list that #55 retired; Git history keeps it.

Each risk is known, documented, and has a fix path. A fix is a separate issue.
Its pull request updates this table.

| Risk | Impact | Why accepted | Fix path |
| :--- | :--- | :--- | :--- |
| The access token sits in `localStorage` | An injected script could use it until it expires, within the hour | The CSP limits script sources; React escapes rendered text; XSS-01 to XSS-04 pass | Keep it in memory only, at the cost of a refresh on every reload |
| A refresh token stored before 15 October 2026 stays in a browser that has not opened the site since | It is no longer revoked at sign-out, and Supabase keeps it valid unless the project limits session length | The page never sends it and deletes it when the site next loads; the web bundle carries no Supabase key; the project lead ended the move early on 16 October 2026 (#71) | Set an inactivity limit under Authentication → Sessions, if the Supabase plan allows it |
| Registration reveals existing accounts | Signing up with a used address answers `409` | The screen tells the person to sign in instead, which helps people who forgot they registered | Answer as if a code were sent |
| A reset code is spent before the new password is saved (KI-16) | If Supabase refuses the password, the person must ask for a new code | The screen says so, and the send-a-new-code control sits below it | None planned |
| Proof checks are not a malware scan | A well-formed image or PDF can still carry a payload aimed at a viewer | Proofs are private, opened only by Administrators through a signed link on the Storage domain; PDFs with scripts, attachments, or passwords are refused; no outside scanning service sees the documents | Owner review of cost and privacy before any scanning service |
| Phone numbers are confirmed by hand (KI-11) | No proof that a Citizen owns their number | No SMS budget (owner, 3 October and 15 October 2026). My account shows "Confirmed by staff" | Add a Philippine gateway to `PROVIDERS` if a budget appears |
| Earlier rejection notes are replaced on re-upload (KI-17) | The profile shows only the latest note | Owner accepted on 15 October 2026: the audit log keeps every decision and note | None planned |
| The test project holds real people's accounts and 5 uploaded proofs | It is documented as synthetic only, yet may hold real residency documents | Found during #64; awaiting the owner. Meanwhile the proofs stay private (Administrators only, through an audited link), and the write-heavy test runners refuse any non-local target | Owner decision (#74), with retention (#70) |
| Leaked-password checking is off | Known-breached passwords are accepted | The team's free-plan choice (#50) | Turn it on if the plan changes |

## Not yet verified

- Hosted proof upload, decisions, quota exhaustion, races, and fault injection. #64 ran them on local services only, by design.
- A real phone or microphone: speech-to-text runs only where the browser offers it.

## Evidence

- [Local security run, 15 October 2026](../tests/evidence/security-local-2026-10-15/report.md): 43/43.
- [Shared limits and cookie sessions, 15 October 2026](../tests/evidence/auth-limits-local-2026-10-15/report.md): 44/44, plus the limiter SQL suite and two API processes.
- [Combined residency verification, 15 October 2026](../tests/evidence/issue64/report.md): #59 to #63 on one revision; security 46/46, browser 67/67, hosted storage and proof-link checks.
- [Release verification, 4 October 2026](../tests/evidence/release-15a7597-20261004/VERIFICATION.md): hosted Auth, Storage, and RLS.
- [Residency version verification](../tests/evidence/issue61/verification.md).
- `tests/database/atomic-actions.sql` and `supabase/tests/api_access.sql`. Run them only on a database marked
  disposable; see [LOCAL_DEV.md](LOCAL_DEV.md#test-suites).
- [Phase 4 test report](Phase4_Test_Report.md): the original security cases.
