# KAMOTI improvements: session handoff

Updated 2026-10-03 (S1 committed; Phase 2 planned in [PHASE2_PLAN.md](PHASE2_PLAN.md)). Load this first in a new chat. Details live in the linked files; this file only points to them.

## 1. Rules set by the user (do not break)
- **Local only.** Never `git push`, never `gh` writes or PRs, never change remotes, never deploy, never `supabase db push` / `link` against the shared project. The user reviews and pushes.
- **`main` stays at `afb2d51`.** Final step, only on the user's "okay": local `git merge --no-ff improve/integration` into `main`.
- **One stream at a time** in the main session. No parallel agents (7 parallel agents hit the session limit on 2026-10-02).
- **Pause for approval** after each stream or checkpoint. Report: what changed, review findings, check results.
- **Be critical.** Review agent drafts before accepting; fix bugs; say what was wrong.
- Never `git add -A` in the main checkout: `.claude/worktrees/` would be staged as embedded repos (it is now in `.git/info/exclude`).

## 2. Where the facts live
| File | Owns |
| :--- | :--- |
| [docs/updates/scattered_notes.md](docs/updates/scattered_notes.md) | Instructor's raw review notes |
| [docs/updates/IMPROVEMENT_REQUIREMENTS.md](docs/updates/IMPROVEMENT_REQUIREMENTS.md) | Every requirement ID (UA, MP, RS, SW, DM, TB, FB), status, and the decisions table |
| [docs/updates/PARALLEL_PLAN.md](docs/updates/PARALLEL_PLAN.md) | Original plan: Phase 0 seams, file ownership per stream, migration slots, breadcrumbs B1–B13 |
| [docs/updates/handoffs/](docs/updates/handoffs/) `S2.md`–`S7.md` | Per-stream status, exact Phase 2 breadcrumbs, migration notes, judgment calls |
| [ISSUES.md](ISSUES.md) | Open issues and future work (KI-01 to KI-22), written for teammates to copy into GitHub Issues |
| [COMMITS.md](COMMITS.md) | S1b/S1c commit list (done: `d27fd46`..`888e112`) |
| [PHASE2_PLAN.md](PHASE2_PLAN.md) | Phase 2 checkpoints C0–C11, decisions D1–D5 |
| This file | Current state, S1 progress, what to do next |

## 3. Git state
| Branch | SHA | Where | State |
| :--- | :--- | :--- | :--- |
| `main` | `afb2d51` | — | Untouched |
| `improve/base` | `3ac34c9` | — | Phase 0 seams (service/route split, stub routers, deps, env names) |
| `improve/integration` | `888e112` | main checkout | S7, S5, S4, S2, S3, S6 merged; S1a–S1c committed by the user (`d27fd46`, `74e0af0`, `c417cd5`, `888e112`); pushed to `origin` by the user |
| `improve/s1-accounts` | `aa5ef17` | `.claude/worktrees/agent-ac23402bb12c6f069` | Holds an uncommitted duplicate of S1b + S1c; now redundant (discard in PHASE2_PLAN C0) |
| tag `backup/s1-session-2026-10-03` | `46d5c1a` | local tag | The six removed commits, for reference; delete when no longer needed |
| `improve/s2…s7-*` | merged | `.claude/worktrees/agent-*` | Done; kept until cleanup |
| `improve/s6-tables` | `3ac34c9` | `.claude/worktrees/s6-tables` | Stale duplicate with uncommitted partial work; superseded by `s6-tables-2` |

## 4. Decisions confirmed with the user
| Topic | Decision |
| :--- | :--- |
| Stack | Unchanged (React+Vite, Express, Supabase). Google Maps replaces Leaflet only. |
| Residency (UA-8) | Barangay + street + one proof upload (private bucket), admin approves; account works meanwhile, reports flagged "Unverified resident" |
| Name (UA-7) | Format rule + split first/middle/last/suffix; `profiles.name` stays as composed display name |
| Unfixable report | New `rejected` status with required reason via admin verification; built in Phase 2 (B1) |
| Line 9 note | Both: clear error messages (UA-11) and staff reason for rejection (SW-7) |
| Email (UA-5) | 6-digit code via Supabase `signUp` + custom SMTP (team has SMTP) |
| Phone (UA-6) | Real Supabase phone-change OTP through Send SMS Hook → `/api/hooks/send-sms`; dev uses `[auth.sms.test_otp]`; Twilio PH failed for the user, so a PH gateway is plugged in later; fallback admin confirms |
| Maps (MP-1) | Google Maps is a firm requirement; team has a key |
| MP-3/MP-4 | Merged into MP-2 (Makati polygon + place search limited to Makati) |
| SW-4 | Staff request resolution (proof + comment) → admin approves or returns; no direct "resolved" |
| DM-1 vs DM-2 | Rows never deleted; only cancelled-report photo files purged after 90 days (`purged_at`) |

## 5. Stream status (`888e112`: typecheck, 425 tests, build all green)
| Stream | Reqs | Status | Review fixes made |
| :--- | :--- | :--- | :--- |
| S7 Feedback | FB-1 | Merged; B4 wired in C5 (form, summary, averages) | Notification failure no longer 500s after a saved rating |
| S5 Data | DM-1, DM-2 | Merged; purge has no UI/schedule | Wrote missing handoff; browser cleanup skips rated reports |
| S4 Workflow | SW-1–6 | Merged | Work needs an assignee before `in_progress`; labels for S5/S7 actions; test typing |
| S2 Maps | MP-1, MP-2 | Merged; B2 done in C2, B3 done in C3 (Leaflet removed) | Verified boundary independently; flagged fixture pins in Manila |
| S3 Submission | RS-1–5, cancel reason | Merged | Built the web side; per-user draft key; 17 tests; test samples need `primary_problem_id` |
| S6 Tables | TB-1–4 | Merged | Labels for `export.*` actions |
| S1 Accounts | UA-2–12 | Committed on integration; local run passed; handoff `handoffs/S1.md` | See section 6 |

## 6. S1 Accounts (worktree `agent-ac23402bb12c6f069`, branch `improve/s1-accounts`)
Split into checkpoints; pause after each.
- **S1a (done, `a71873d` + `aa5ef17`, 373 tests green):**
  - Migration `20261003000200_accounts.sql`: name parts + backfill, `barangay` (23 Makati), `address_line`, `privacy_consent_at`, `phone_verified_at`, residency status/proof/note/reviewer, private bucket `residency-proofs` (5 MB, JPG/PNG/WebP/PDF). Covers S1b and S1c too.
  - UA-4 password rule (8–72, letter, digit, special) + `PasswordRules` checklist; UA-7 split name, barangay, street, RA 10173 consent on Register and admin create-user; UA-11 `accountError` mapping; UA-10 rate limits (`lib/rate-limit.ts`), server-side session revoke on logout, deactivated accounts never get a session (`sessionResponse`).
  - Register still uses `admin.createUser(email_confirm: true)` with `user_metadata` for profile recovery; S1b switches it.
  - Fixed in review: middle initial ("D.") now gets the right message; password parity test uses the real web rule.
- **S1b (done, `8cc829a` + `9506eaf` + `1a3e3a2`, 404 tests green):** UA-5, UA-9, and UA-12 (password reset, added by the user 2026-10-03).
  - Server (`lib/accounts-email.ts`, `auth.routes.ts`): register → `auth.signUp`; profile is built by `ensureProfile()` on the first confirmed session (Supabase keeps the first details of an unconfirmed address, so no insert at register). `verify-email` uses `verifyOtp` type `signup` (checked `verify.go`: `email` also accepts reset codes). `resend-code`, `forgot-password` answer the same for unknown addresses. `reset-password` → `verifyOtp` `recovery`, `admin.updateUserById`, `signOut(global)`. `refresh` → any failure is 401. If Supabase returns a session at sign-up (confirmations off), the login is deleted and the API answers 503: no bypass (user's choice).
  - `config.toml`: confirmations on, `minimum_password_length = 8`, `letters_digits` (S1a comment claimed it was set; it was not), `supabase/templates/confirmation.html` + `recovery.html` with `{{ .Token }}`.
  - Web: `EmailCode.tsx` (code step on Register and on SignIn for `email_not_confirmed`), `PasswordReset.tsx` at `/signin?step=reset` (no new route), refresh token in localStorage (user's choice), `api.ts` single-flight refresh + retry once on 401, `auth.tsx` refresh 60 s before `expires_at`, `IdleTimeoutDialog.tsx` (15 min + 60 s, all roles, all tabs, fires `kamoti:idle-signout`, message on sign-in).
  - Fixed in review: idle redirect kept forcing public pages back to sign-in; ACC-11 locks register rules to the profile rebuild check.
- **S1c (done, `8b0e277` + `193356f`, 425 tests green):** decisions 2026-10-03 in IMPROVEMENT_REQUIREMENTS.
  - UA-8: proof uploaded **signed in** after the email code (`POST /api/auth/me/residency-proof`), never at register (signUp returns the real id of an unconfirmed address, so a stranger could overwrite its file). **Strict lock**: no proof or rejected → only `/register?step=proof`; citizen menu greyed (`aria-disabled`), banner; `requireResidency` (403 `residency_required`) on reports, feedback, notifications, exports. New and existing citizens. Sending a proof unlocks; reports show "Unverified resident" until accepted.
  - Admin: `GET /users/:id/residency-proof` (300 s, logged), `PATCH /users/:id/residency` (reject needs reason; citizen notified), `?residency=` filter, `ResidencyReview` dialog, StaffReport tags.
  - UA-6 **deferred (no SMS budget)**: hook + `lib/sms.ts` committed dormant with tests; `PATCH /users/:id/phone-verified` fallback; changing a number clears it. Removed the unused `accounts-phone.ts` draft (copy in the session scratchpad). Turning SMS on later needs: a provider in `PROVIDERS`, a phone-change start (`PUT /auth/v1/user` with the user's token), `verifyOtp` type `phone_change` (revoke the extra session it opens), `[auth.sms] enable_confirmations`, and the hook URL/secret.
  - Fixture citizens are seeded `verified`; the demo seed (`scripts/demo`) still needs the same (B12), or demo citizens are locked.
- **S1 local run (done 2026-10-03, local Supabase in Docker, never linked):** all 12 migrations apply to a fresh database; 18/18 browser checks pass (sign-up code, wrong code, proof lock + greyed menu + server 403, upload unlocks, admin opens/rejects with reason, re-upload, unconfirmed sign-in → code, password reset ends other sessions, refresh + retry, idle warning/stay/sign-out).
  - **Found and fixed (`46d5c1a`):** `GET /api/admin/users` failed with PGRST200 since S1a; the self-referencing reviewer embed must use the column (`reviewer:residency_reviewed_by(...)`), not the constraint name.
  - `bun run fixture` creates accounts but stops at reports: the fixture pins violate `reports_within_makati_bbox` (B2, Phase 2).
  - Script: session scratchpad `s1-run.ts` (Playwright, reads codes from Mailpit at :54324); fold into B12 browser tests. Local stack stays up until `bunx supabase stop`.
- **Done 2026-10-03:** `docs/updates/handoffs/S1.md` written. The user asked to remove this session's commits and commit themselves: commits reset (backup tag), integration fast-forwarded to S1a, S1b/S1c applied as uncommitted changes in the main checkout, and [COMMITS.md](COMMITS.md) lists four file-disjoint commits, each replayed and green (373 → 398 → 425 → 425 tests).
- **Fixed in Phase 2 C2:** `bun run fixture` completes; report pins are Makati-only in the browser, the API, and the database bbox check.
- UA-2 and UA-3 are existing; verify only. UA-1 permissions doc is Phase 2 (B13).

## 7. Phase 2: integration breadcrumbs (after S1 merges)
Exact edits are in each `handoffs/S*.md`. Summary, roughly in order:
1. **REPORT_FIELDS** (`services/reports.common.ts`): add problems, workflow columns (`assigned_at`, `status_changed_at`, closure, verified), `photos.purged_at` + `photoUrl(path, purged_at)`; then drop the extra `/problems` and `/workflow` fetches where possible.
2. **B2 Makati check** in `createSchema`/`editSchema` (`superRefine(refineInsideMakati)`); move Manila sample pins in tests and `scripts/fixture/seed.ts` into Makati.
3. **B3** `LocationMap` into ReportDetail + StaffReport; remove `leaflet`, `react-leaflet`, `@types/leaflet`, `lib/leaflet.ts`, Leaflet CSS in `main.tsx`; resolved pins green with a check.
4. **B1 `rejected` status (SW-7)**: enum value, `CLOSURE_OUTCOMES`/`OUTCOME_STATUS`, StaffReport "Request rejection", badges, board/public view, filters, analytics, exports.
5. **B4** `FeedbackForm` in ReportDetail (owner, resolved), `FeedbackSummary` in StaffReport.
6. **ReportDetail timeline** uses `updateTypeLabel`; citizen sees "Awaiting verification".
7. **`cancelReport`** also sets `status_changed_at`.
8. **B5 AdminUsers**: `SpecializationEditor`, `DataTable`; `api.put()` then drop the PATCH alias in `staff.routes.ts`.
9. **B6 table/export columns**: problems, assigned, delay, verification, rating, barangay, residency flag.
10. **B9 AdminLogs** renders `activityLabel()`; server-side log filters.
11. **B8** "Photo removed after the 90-day retention period"; optional admin purge button + Vercel cron.
12. **B7** area routing by barangay (or document as a limitation).
13. **B10** fold stream type files (`submission-types.ts`, `feedback.ts`, `table-types.ts`, `accounts-types.ts`) into `types.ts`.
14. **B12 tests**: Playwright flows (problems, cancel reason, comments, request/verify, maps selectors, tables, email code, password reset, idle dialog; `auth.browser.ts` register test still uses `#name`), `scripts/demo` flow, fixtures (verified residents, specializations).
15. **B13 docs**: API, FRONTEND, ARCHITECTURE, DEVELOPER_JOURNEYS state machine, LOCAL_DEV env, UA-1 roles/permissions; update requirement statuses; delete `docs/updates/handoffs/` and `PARALLEL_PLAN.md`.
16. `/code-review high` + `/security-review` on `improve/integration`; fix; report; local merge to `main` on the user's "okay".

## 8. Actions only the user (migration owner) can do
- Apply migrations on a **disposable/local** Supabase first: `bunx supabase db push --dry-run`. Order: `…000100` no-delete, `…000200` accounts, `…000300` problem types, `…000400` workflow, `…000500` feedback, `…000600` Makati bbox, `…000700` rejected status, `…000710` public rejection reason (each in its own transaction: Postgres cannot use a new enum value in the transaction that adds it).
- Before or right after `…000600`: move existing `[FIXTURE]` and any out-of-Makati report pins inside Makati, then `validate constraint reports_within_makati_bbox` (a NOT VALID check still blocks UPDATEs on bad rows).
- After `…000100`, deleting a user in the Supabase dashboard fails on purpose; deactivate instead.
- Google Cloud: enable Maps JavaScript API + Places API (New); restrict the key by HTTP referrer and API; set `VITE_GOOGLE_MAPS_API_KEY` (optional `VITE_GOOGLE_MAPS_MAP_ID`).
- Supabase Auth (hosted, after S1 merges): turn on **Confirm email** (until then registration answers 503 on purpose); custom SMTP (built-in mail sends ~2/hour); email OTP length **6**; paste `supabase/templates/confirmation.html` into Confirm signup and `recovery.html` into Reset password; minimum password length 8 + "letters and digits"; Send SMS Hook URL + `SEND_SMS_HOOK_SECRET`; later `SMS_PROVIDER`/`SMS_API_KEY` for a PH gateway.

## 9. Checks
- Per stream and on integration: `bun run typecheck`, `bun test`, `bun run build` (chunk-size warning is pre-existing).
- A single test file needs placeholder env: `SUPABASE_URL=https://x.supabase.co SUPABASE_PUBLISHABLE_KEY=x SUPABASE_SECRET_KEY=x bun test <file>`.
- Live checks after migrations: `bun run test:security`, `bun run test:browser`, `/verify-kamoti` evidence.

## 10. Known limitations and risks
- Rate limits are in memory: exact on one Node process, a floor on Vercel serverless.
- PDF export uses built-in Helvetica: "→" or emoji print garbled (CSV fine).
- Edit form has no draft (unload warning + Cancel confirm only); in-app navigation is not blocked (BrowserRouter).
- Admins cannot resolve directly; every closure goes staff request → admin approval.
- Phone OTP delivery depends on a PH SMS gateway the team still has to choose.
- UA-5/12: re-registering an unconfirmed address keeps its first password and details (Supabase); the reset covers a forgotten first password. A second code request within Supabase's per-address window answers 429 only for real addresses (minor enumeration). If Supabase rejects a new password after the reset code is spent, the person asks for a new code.
- UA-9: refresh token in localStorage is readable by any script on the page (XSS); an httpOnly cookie is the hardening step. Logout after the access token expires cannot revoke on the server (the refresh token is only cleared locally).
- Deploy order: the S1 code reads the S1a columns on every request (`requireAuth`), so it must not be deployed before migration `…000200`, or every sign-in fails. Since C1, `REPORT_FIELDS` also reads `report_photos.purged_at` (`…000100`), the problem joins (`…000300`), and the workflow columns (`…000400`): every report page and list fails until those are applied too.
- Citizens are locked until they upload a proof (strict, by decision); entry-page buttons to citizen pages redirect to the proof step rather than being greyed.
- Browser tests and demo seed still use old flows ("Mark resolved", single name, optional cancel reason) until B12.

## 11. Cleanup (only with the user's go-ahead)
- `git worktree remove` each `.claude/worktrees/*` and `git branch -d` the stream branches after the final merge.
- Discard the stale `.claude/worktrees/s6-tables` / `improve/s6-tables` (uncommitted partial duplicate).
- Remove the line `.claude/worktrees/` from `.git/info/exclude` only if no worktrees remain.

## 12. Prompt to resume in a new chat
> Read `HANDOFF.md` and `PHASE2_PLAN.md` at the repo root, then `docs/updates/IMPROVEMENT_REQUIREMENTS.md`. Start the next open checkpoint in `PHASE2_PLAN.md` section 3 in the main checkout. Follow the rules in section 1: local only, no push, one checkpoint at a time, pause for my approval.
