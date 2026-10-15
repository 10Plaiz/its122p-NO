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
| The refresh token is an `HttpOnly`, `SameSite=Strict` cookie on `/api/auth`, so page scripts cannot read it (KI-12) | `src/server/lib/session-cookie.ts` | Source (`tests/fast/accounts-email.test.ts` ACC-13); security IMP-16 written, not yet run |
| `/api/auth/refresh` needs the `X-KAMOTI-Session` header, which another site cannot send | `requireSessionHeader` | Source (ACC-13) |
| Sign-out revokes the session by refresh cookie, even after the access token expired | `/api/auth/logout` | Local (security IMP-10, before the cookie) |
| A deactivated account gets `403` on every route, at sign-in, and at refresh | `requireAuth`, `accounts-profile.ts` | Local (security IMP-14) |
| After 15 idle minutes a one-minute warning appears, then the browser signs out and keeps the report draft | `src/web/lib/idle.ts` | Source; browser session tests |

### Authorization

| Control | Where | Evidence |
| :--- | :--- | :--- |
| Role gates on every protected router | `requireRole` | Local (security AUTHZ-11, AUTHZ-12); Source (`tests/fast/permissions.test.ts`) |
| Record checks: Citizens see their own reports, Staff their assigned ones, Administrators all | `src/server/services/reports.access.ts` | Local (AUTHZ-06 to AUTHZ-15) |
| Role scope is applied before any filter, so a filter can only narrow results | `scopeReportQuery`, also in exports | Source |
| Locked Citizens (no proof, or rejected) get `403 residency_required` | `requireResidency` | Local (IMP-01, IMP-15) |
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
| Proofs go to the private `residency-proofs` bucket; responses carry only a proof-present flag | `src/server/lib/residency.ts` | Local (IMP-02) |
| An Administrator opens a proof through a five-minute signed link, and the access audit is saved before the link is returned | `GET /api/admin/users/:id/residency-proof` | Local (IMP-03, IMP-12) |
| A residency decision is bound to the proof and address version the Administrator saw | `residency_review_version`, `residency_proof_versions` | Local (`tests/evidence/issue61/verification.md`) |
| Proofs: JPG, PNG, WebP, or PDF up to 5 MB, with a check of the first bytes | `residency.ts` | Source (`tests/fast/residency.test.ts`) |
| Report photos: JPG, PNG, or WebP up to 3 MB, with the same first-byte check, before the report is saved | `checkPhoto` in `src/server/lib/photos.ts` | Source (`tests/fast/photos.test.ts`) |

### Abuse limits

| Control | Where | Evidence |
| :--- | :--- | :--- |
| Sign-in: 10 failures for one address from one client, 30 from one client, and 20 for one address from any client, in 15 minutes | `src/server/lib/rate-limit.ts` | Source (`tests/fast/accounts.test.ts`) |
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

Each risk is known, documented, and has a fix path. A fix is a separate issue.
Its pull request updates this table.

| Risk | Impact | Why accepted | Fix path |
| :--- | :--- | :--- | :--- |
| The access token sits in `localStorage` | An injected script could use it until it expires, within the hour | The CSP limits script sources; React escapes rendered text; XSS-01 to XSS-04 pass | Keep it in memory only, at the cost of a refresh on every reload |
| `/refresh` still accepts a body token | Only for moving sessions stored before the cookie | It is spent on first use and the browser deletes its copy | Remove the fallback after 7 days in production |
| Account rate limits are counted per server instance (KI-14) | On Vercel with several warm instances, an attacker gets a multiple of each limit | Supabase Auth applies its own limits behind these | In progress: a Postgres-backed store. Needs a migration |
| Registration reveals existing accounts | Signing up with a used address answers `409` | The screen tells the person to sign in instead, which helps people who forgot they registered | Answer as if a code were sent |
| A reset code is spent before the new password is saved (KI-16) | If Supabase refuses the password, the person must ask for a new code | The screen says so, and the send-a-new-code control sits below it | None planned |
| A proof's PDF check reads only the header | A malformed PDF can be stored | Proofs are private and opened only by Administrators | #62 |
| Phone numbers are confirmed by hand (KI-11) | No proof that a Citizen owns their number | No SMS budget (owner, 3 October and 15 October 2026). My account shows "Confirmed by staff" | Add a Philippine gateway to `PROVIDERS` if a budget appears |
| Earlier rejection notes are replaced on re-upload (KI-17) | The profile shows only the latest note | Owner accepted on 15 October 2026: the audit log keeps every decision and note | None planned |
| Replaced proofs are kept with no retention rule | Private personal documents stay in Storage | The owner has not decided a period; 30 days after replacement is proposed | Owner decision, then a purge like photo retention |
| A name correction drops verified residency | A Citizen verified without a proof file gets locked | Found during #54 | #67 |
| Pending Citizens can file reports | Reports from unconfirmed residents reach Staff | Earlier owner rule; replaced by an approved rule not yet built | #59 |
| Leaked-password checking is off | Known-breached passwords are accepted | The team's free-plan choice (#50) | Turn it on if the plan changes |

## Not yet verified

- The combined residency hardening (#64).
- The shared project records the first 18 migrations (#49). The owner reports the
  three later ones, from `20261005000100` to `20261006000200`, are applied too
  (15 October 2026); no migration list confirms it yet.
- The security suite's cookie cases (IMP-10, IMP-14, IMP-16) after KI-12. They
  need the local Supabase stack, which was not running.
- A real phone or microphone: speech-to-text runs only where the browser offers it.

## Evidence

- [Local security run, 15 October 2026](../tests/evidence/security-local-2026-10-15/report.md): 43/43.
- [Release verification, 4 October 2026](../tests/evidence/release-15a7597-20261004/VERIFICATION.md): hosted Auth, Storage, and RLS.
- [Residency version verification](../tests/evidence/issue61/verification.md).
- `tests/database/atomic-actions.sql` and `supabase/tests/api_access.sql`. Run them only on a database marked
  disposable; see [LOCAL_DEV.md](LOCAL_DEV.md#test-suites).
- [Phase 4 test report](Phase4_Test_Report.md): the original security cases.
