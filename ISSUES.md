# Known issues and future work

Updated 2026-10-03, after the S1 Accounts work. A staging list for the team: [CONTRIBUTING.md](CONTRIBUTING.md) says GitHub Issues own current work, so copy an entry into a GitHub issue (title, labels, and the "Done when" list as completion criteria) before working on it, then mark it here with the issue number.

**How to read an entry.** Priority **P1** blocks deploying the improvements, **P2** is a real defect or gap, **P3** is hardening or polish. "Where" points at the files; the linked handoff has the exact detail. Run `bun run typecheck`, `bun test`, and `bun run build` before any pull request, and never run `supabase db push` or `supabase link` against the shared project without the migration owner.

| ID | Title | Priority | Area |
| :--- | :--- | :--- | :--- |
| [KI-01](#ki-01) | Apply the new migrations to the shared Supabase project | P1 | Database |
| [KI-02](#ki-02) | Set up Supabase Auth email on the shared project | P1 | Database |
| [KI-03](#ki-03) | Set up the Google Maps key | P1 | Frontend |
| [KI-04](#ki-04) | Fixture seed fails: sample report pins are outside Makati | P2 | Database, tests |
| [KI-05](#ki-05) | Demo seed citizens will be locked out | P2 | Tests |
| [KI-06](#ki-06) | Browser tests still use old flows | P2 | Tests |
| [KI-07](#ki-07) | Browser tests for the new account flows | P2 | Tests |
| [KI-08](#ki-08) | Security tests for the new routes, table, and bucket | P2 | API, tests |
| [KI-09](#ki-09) | Phase 2 integration of the improvement streams | P2 | All |
| [KI-10](#ki-10) | Citizens cannot edit their own details | P2 | Frontend, API |
| [KI-11](#ki-11) | Phone verification by text message (UA-6) | P3 | API |
| [KI-12](#ki-12) | Move the refresh token to an httpOnly cookie | P3 | API, frontend |
| [KI-13](#ki-13) | Sign-out with an expired access token does not revoke the session | P3 | API |
| [KI-14](#ki-14) | Rate limits are per server instance | P3 | API |
| [KI-15](#ki-15) | Code requests reveal which emails have accounts | P3 | API |
| [KI-16](#ki-16) | A spent reset code cannot be retried | P3 | API, frontend |
| [KI-17](#ki-17) | Rejection reasons are overwritten by the next upload | P3 | Database |
| [KI-18](#ki-18) | Home page buttons are not greyed out for locked citizens | P3 | Frontend |
| [KI-19](#ki-19) | Report edit form has no draft | P3 | Frontend |
| [KI-20](#ki-20) | PDF export garbles arrows and emoji | P3 | Frontend |
| [KI-21](#ki-21) | Web bundle is over 500 kB | P3 | Frontend |
| [KI-22](#ki-22) | Documentation for the improvements | P2 | Docs |

---

## Before deploying

### KI-01
**Apply the new migrations to the shared Supabase project** · P1 · Database (migration owner)
- **Problem:** six migrations (`supabase/migrations/20261003000100` to `…000600`) exist only in the repository. The API now reads the S1 account columns on every signed-in request, so deploying the code before `…000200_accounts.sql` makes every sign-in fail. Report pages and lists also read columns from `…000100`, `…000300`, and `…000400`.
- **Where:** `supabase/migrations/`; order and checks in [HANDOFF.md](HANDOFF.md) section 8.
- **Done when:**
  - [ ] All six applied on a disposable or local project first (they applied cleanly to a fresh local database on 2026-10-03).
  - [ ] Out-of-Makati report pins moved inside Makati, then `reports_within_makati_bbox` validated.
  - [ ] Applied to the shared project by the migration owner, before the code is deployed.

### KI-02
**Set up Supabase Auth email on the shared project** · P1 · Database
- **Problem:** sign-up and password reset send a 6-digit code by email. The shared project still has "Confirm email" off, Supabase's built-in mailer only reaches team members (about 2 emails an hour), and its templates send links, not codes. Until this is done, registration answers 503 on purpose rather than create unverified accounts.
- **Where:** Supabase dashboard; templates in `supabase/templates/confirmation.html` and `recovery.html`; local settings to mirror in `supabase/config.toml`.
- **Done when:**
  - [ ] Custom SMTP configured.
  - [ ] Confirm email on; email OTP length 6; minimum password length 8 with letters and digits.
  - [ ] Confirm signup and Reset password templates replaced with the two files above.
  - [ ] A real address registers, receives a code, confirms, and resets its password.

### KI-03
**Set up the Google Maps key** · P1 · Frontend
- **Problem:** maps and place search need a restricted key.
- **Where:** `VITE_GOOGLE_MAPS_API_KEY` (optional `VITE_GOOGLE_MAPS_MAP_ID`); [HANDOFF.md](HANDOFF.md) section 8.
- **Status:** a key exists and works on localhost (2026-10-03): maps, Makati place search, and pins load with no console errors.
- **Done when:**
  - [x] Maps JavaScript API and Places API (New) enabled.
  - [ ] Key restricted by HTTP referrer and by API (check both are set; add daily quota caps so usage cannot be billed).
  - [ ] `VITE_GOOGLE_MAPS_API_KEY` set on Vercel, and the report form map and place search work on the deployed site.

---

## Bugs

### KI-04
**Fixture seed fails: sample report pins are outside Makati** · P2 · Database, tests
- **Problem:** `bun run fixture` creates the fixture accounts, then stops with `new row for relation "reports" violates check constraint "reports_within_makati_bbox"`. The sample reports are pinned in Manila. Left unfixed on purpose for the team to look at (Phase 2 item B2).
- **Where:** `scripts/fixture/seed.ts` (report specs); test samples in `tests/`; server check `refineInsideMakati` not yet wired into `createSchema`/`editSchema`.
- **Status:** fixed locally on 2026-10-03 (Phase 2 C2); not yet run on the shared project.
- **Done when:**
  - [x] Fixture and test pins are inside Makati (fixture reports now live in `scripts/fixture/reports.ts`; `tests/fast/makati.test.ts` checks them and the demo pins).
  - [x] `bun run fixture -- --target 127` completes on the local database.
  - [x] The server rejects a pin outside Makati with a field error (B2), on create and on an edit that moves the pin.

### KI-05
**Demo seed citizens will be locked out** · P2 · Tests
- **Problem:** citizens without an accepted proof of residency are locked to the upload step (decision 2026-10-03). The demo seed does not mark its citizens as verified, so every demo citizen will land on "Prove you live in Makati".
- **Where:** `scripts/demo/*`; copy `residencyFor()` from `scripts/fixture/seed.ts`.
- **Done when:**
  - [ ] Demo citizens are seeded with `residency_status = 'verified'`.
  - [ ] A demo citizen signs in straight to My reports.

### KI-06
**Browser tests still use old flows** · P2 · Tests
- **Problem:** `tests/browser/auth.browser.ts` fills `#name`, which became first, middle, and last name fields. Other browser tests still expect "Mark resolved" and an optional cancel reason.
- **Where:** `tests/browser/*.browser.ts`; details in [docs/updates/handoffs/](docs/updates/handoffs/) S1, S3, S4.
- **Done when:**
  - [ ] `bun run test:browser` passes against a local Supabase with the fixture data.

---

## Tests

### KI-07
**Browser tests for the new account flows** · P2 · Tests
- **Problem:** sign-up code, password reset, refresh, idle sign-out, and the residency lock were checked once with a throwaway script on a local Supabase (18 of 18 passed). They need permanent Playwright tests.
- **Where:** `tests/browser/`. Selectors and the Mailpit trick are listed in [handoffs/S1.md](docs/updates/handoffs/S1.md) (Breadcrumbs, `tests/browser/*` row).
- **Done when:** tests cover:
  - [ ] Register, then the code (read from Mailpit at `http://127.0.0.1:54324`), then the proof step.
  - [ ] Locked citizen: greyed menu, redirect, API 403.
  - [ ] Admin rejects with a reason; the citizen sees it and uploads again.
  - [ ] Signing in while unconfirmed switches to the code step.
  - [ ] Password reset signs out the other sessions.
  - [ ] Idle warning and sign-out.

### KI-08
**Security tests for the new routes, table, and bucket** · P2 · API, tests
- **Problem:** `tests/integration/security.ts` predates the improvements.
- **Where:** `tests/integration/security.ts`; rows in [handoffs/S1.md](docs/updates/handoffs/S1.md) and [handoffs/S7.md](docs/updates/handoffs/S7.md).
- **Done when:**
  - [ ] Locked citizen gets 403 `residency_required` on reports, notifications, feedback, and exports.
  - [ ] Anonymous and signed-in clients cannot read the `residency-proofs` bucket; only admins get a proof link.
  - [ ] `report_feedback` cannot be read or written directly; the feedback rules return 403, 400, and 409 as documented.

---

## Integration

### KI-09
**Phase 2 integration of the improvement streams** · P2 · All
- **Problem:** the streams were built in parallel and each left edits for files it did not own. A tracking issue; split items into their own issues as people pick them up.
- **Where:** [HANDOFF.md](HANDOFF.md) section 7 (order) and [docs/updates/handoffs/](docs/updates/handoffs/) (exact edits).
- **Done when** each is merged:
  - [ ] REPORT_FIELDS carries problems, workflow columns, and photo purge state.
  - [ ] B1 `rejected` report status with a required reason (SW-7).
  - [x] B2 server-side Makati check (see KI-04).
  - [x] B3 ReportDetail and StaffReport use Google Maps; Leaflet removed (C3).
  - [ ] B4 feedback form and summary on the report pages.
  - [ ] B5 AdminUsers on `DataTable`, keeping the residency column, review dialog, and phone control.
  - [ ] B6 table and export columns, including residency and phone verified.
  - [ ] B7 area routing by barangay, or documented as a limitation.
  - [ ] B8 "Photo removed after the 90-day retention period"; optional purge schedule.
  - [ ] B9 readable activity log labels and server-side log filters.
  - [ ] B10 type files folded into `src/web/lib/types.ts`.
  - [ ] B12 and B13: see KI-05 to KI-08 and KI-22.

---

## Features and gaps

### KI-10
**Citizens cannot edit their own details** · P2 · Frontend, API
- **Problem:** there is no screen for a citizen to correct their name, contact number, barangay, or street after registering. Only an administrator can change them. Signing up again does not help: for an address that is not yet confirmed, Supabase keeps the first details.
- **Where:** new `PATCH /api/auth/me` (reuse `nameParts`, `contactNumber`, `barangay`, `addressLine` from `src/server/lib/validate.ts`); a page or panel for it. Adding a route needs team agreement. A changed contact number must clear `phone_verified_at`; a changed address may need a new proof review.
- **Done when:**
  - [ ] A citizen updates their details with the same rules as registration.
  - [ ] The phone and residency side effects above are applied and tested.

### KI-11
**Phone verification by text message (UA-6)** · P3 · API
- **Problem:** deferred because there is no SMS budget. The signed Send SMS Hook and a provider slot exist but are unused; administrators mark numbers verified by hand.
- **Where:** `src/server/routes/hooks.routes.ts`, `src/server/lib/sms.ts`; steps in [HANDOFF.md](HANDOFF.md) section 6 (S1c).
- **Done when:**
  - [ ] A Philippine SMS gateway is added to `PROVIDERS`.
  - [ ] A signed-in user can start a phone change and verify it (`verifyOtp` type `phone_change`, ending the extra session it opens).
  - [ ] The hook URL and secret are set on the Supabase project.

---

## Security hardening

### KI-12
**Move the refresh token to an httpOnly cookie** · P3 · API, frontend
- **Problem:** the refresh token sits in localStorage (team choice, 2026-10-03), so a script injected into the page could read it.
- **Where:** `src/web/lib/api.ts` (`storeSession`, `refreshSession`), `src/server/routes/auth.routes.ts` (`/refresh`, `/logout`).
- **Done when:**
  - [ ] The refresh token is set as an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/auth`.
  - [ ] `/refresh` is protected against cross-site requests.
  - [ ] Logout clears the cookie.

### KI-13
**Sign-out with an expired access token does not revoke the session** · P3 · API
- **Problem:** logout revokes with the access token. If it has already expired, the server cannot revoke the session; the refresh token is only cleared in the browser.
- **Where:** `src/server/routes/auth.routes.ts` (`/logout`), `src/web/lib/auth.tsx` (`signOut`).
- **Done when:** logout also revokes by refresh token, or refreshes first; there is a test that an old refresh token stops working.

### KI-14
**Rate limits are per server instance** · P3 · API
- **Problem:** the limits live in memory. They are exact on one Node process but only a floor on serverless hosting with several warm instances.
- **Where:** `src/server/lib/rate-limit.ts`.
- **Done when:** a shared store (for example Redis or a Postgres table) backs the limiter, or the limitation is documented in the security review (UA-10).

### KI-15
**Code requests reveal which emails have accounts** · P3 · API
- **Problem:** asking again for a code inside Supabase's per-address waiting time answers 429 only for addresses that exist. Low risk, since sign-in already reveals unconfirmed accounts.
- **Where:** `/resend-code`, `/forgot-password` in `src/server/routes/auth.routes.ts`.
- **Done when:** the team decides to accept it (documented under UA-10), or a per-address 429 is answered as a normal 204.

### KI-16
**A spent reset code cannot be retried** · P3 · API, frontend
- **Problem:** the code is used up before the new password is saved. If Supabase then refuses the password (for example under its leaked-password check), the person has to ask for a new code.
- **Where:** `resetPassword` in `src/server/lib/accounts-email.ts`.
- **Done when:** the screen says clearly that a new code is needed, or the password is checked before the code is spent.

---

## Polish

### KI-17
**Rejection reasons are overwritten by the next upload** · P3 · Database
- **Problem:** a new upload clears `residency_note`. Earlier reasons survive only in the activity log.
- **Where:** `POST /api/auth/me/residency-proof`; `profiles` columns from `20261003000200_accounts.sql`.
- **Done when:** reviews are kept as history (a `residency_reviews` table), or the team accepts the activity log as the record.

### KI-18
**Home page buttons are not greyed out for locked citizens** · P3 · Frontend
- **Problem:** the menu greys out citizen links while a citizen has no accepted proof, but buttons on the home page still look active and redirect to the proof step when clicked.
- **Where:** `src/web/pages/Entry.tsx`; use `residencyLocked(user)` from `src/web/lib/residency.ts`.
- **Done when:** those buttons match the menu (greyed out with a reason).

### KI-19
**Report edit form has no draft** · P3 · Frontend
- **Problem:** the new-report form keeps a draft, but the edit form only warns on page unload. In-app navigation is not blocked because the app uses `BrowserRouter`.
- **Where:** the edit form in `src/web/pages/ReportDetail.tsx` (uses `useUnsavedChangesWarning`); `useDraft` in `src/web/lib/useDraft.ts`.
- **Done when:** edits survive a reload or idle sign-out like new reports do.

### KI-20
**PDF export garbles arrows and emoji** · P3 · Frontend
- **Problem:** the PDF is built in the browser with the built-in Helvetica font, so "→" and emoji print as wrong characters. CSV export is fine.
- **Where:** `src/web/lib/export.ts` (`doc.setFont("helvetica", …)`); the rows come from `src/server/routes/exports.routes.ts`.
- **Done when:** a Unicode font is embedded, or those characters are replaced before rendering.

### KI-21
**Web bundle is over 500 kB** · P3 · Frontend
- **Problem:** `bun run build` warned that the main chunk was over 500 kB. Removing Leaflet (C3) brought it to about 492 kB, so the warning is gone for now, with little headroom.
- **Where:** `src/web/routes.tsx` (pages are imported eagerly).
- **Done when:** admin and staff pages are lazy-loaded and the warning is gone, or the threshold is raised with a reason.

---

## Documentation

### KI-22
**Documentation for the improvements** · P2 · Docs
- **Problem:** the API, frontend, and local-development guides predate the improvements, and UA-1 (one document for each role's permissions) is still open.
- **Where:** `docs/API.md`, `docs/FRONTEND.md`, `docs/ARCHITECTURE.md`, `docs/LOCAL_DEV.md`; the exact lists are in each handoff's "Doc changes" section, starting with [handoffs/S1.md](docs/updates/handoffs/S1.md).
- **Done when:**
  - [ ] Every new endpoint, component, and environment variable is documented.
  - [ ] The local Supabase and Mailpit setup is in LOCAL_DEV.
  - [ ] Roles and permissions are in one place.
  - [ ] Requirement statuses are updated, and `docs/updates/handoffs/` and `PARALLEL_PLAN.md` are removed afterwards.
