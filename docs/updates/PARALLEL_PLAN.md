# Plan: 7 parallel agents for IMPROVEMENT_REQUIREMENTS.md

## Context
- Source: `docs/updates/IMPROVEMENT_REQUIREMENTS.md` (instructor review, 7 sections).
- Goal: 7 background agents, one per section, each in its own git worktree, then one integration pass ("breadcrumbs") that does all cross-section work.
- Problem: 8 hot files are shared by most sections → parallel edits would collide:
  `reports.service.ts`, `reports.routes.ts`, `app.ts`, `web/lib/types.ts`, `components/ui.tsx`, `styles/app.css`, `package.json`/`bun.lock`, `tests/fast/validation.test.ts`.
- Fix: a small **Phase 0** (no features, only seams + contracts) → **Phase 1** 7 agents with strict file ownership → **Phase 2** integration of everything that crosses sections.

## User Review: decisions (agents cannot ask questions mid-run)
| Topic | Decision | Rationale |
| :--- | :--- | :--- |
| UA-8 residency | **Recommended:** barangay dropdown + address + one proof-of-residency upload (private bucket), admin approves in Users. Account works immediately; its reports show "Unverified resident" until approved. | Professor said "confirm". Self-declaration (A) or approval with nothing to check (B) confirms nothing. Reuses existing multer upload code. Needs a Data Privacy Act consent checkbox. |
| Name | Format rule (`names.ts`) + split `first/middle/last/suffix` columns. Keep `profiles.name` as the composed display name, written by the server. | Every existing reader of `name` keeps working. Backfill splits on the last space. |
| Unfixable report | New `rejected` status with required reason, through admin verification. **Built in Phase 2** (touches every status consumer). | User choice. S4 builds a generic closure-request schema so Phase 2 adds no columns. |
| UA-5 email | Real: Supabase `signUp` + custom SMTP, **6-digit code** (`{{ .Token }}` in the Confirm signup template, entered in-app, `verifyOtp`). S1 verifies `type: 'signup'` first; fallback `'email'`. Admin-created staff stay pre-confirmed. | User choice; SMTP available. |
| UA-6 phone OTP | Real Supabase flow: `updateUser({ phone })` → `verifyOtp({ type: 'phone_change' })`. SMS goes through Supabase's **Send SMS Hook** → our endpoint `POST /api/hooks/send-sms` (signature-checked with `standardwebhooks`) → provider adapter selected by env. Dev/tests use `[auth.sms.test_otp]` fixed codes. No provider configured → phone shows "unverified", admin can mark it confirmed. | Supabase does not send SMS itself; Twilio PH delivery failed for the user. The hook lets the team plug in a Philippine SMS gateway later (team picks one and confirms PH sender rules) with no code change. |
| MP-1 | Google Maps via `@vis.gl/react-google-maps`, key in `VITE_GOOGLE_MAPS_API_KEY`, restricted by HTTP referrer. | Key available; proposal allows either library (`Final_Project.md:242`). |
| MP-3/MP-4 | Merged into MP-2 (Makati polygon, UI + server) + Places search with `strictBounds`. "Infrastructure" = the category list. | Snapping to "infrastructure places" has no data source; would be guesswork. |
| SW-1 | Specialization by **category** now. "Area" by barangay → Phase 2 (B7) once S1 barangays exist. | Area needs S1 data. |
| SW-4 | Staff "Request resolution" (photo + comment) → admin Approve (→ resolved) / Return (→ in_progress, comment required). Staff can no longer set `resolved`. | No enum change in Phase 1. |
| DM-1 vs DM-2 | Rows are never deleted. Retention purges only the **storage file** of cancelled-report photos after 90 days; row keeps `purged_at`. | Resolves the conflict. |
| RS-2 + RS-4 | Seeded `problem_types` per category. Primary required, secondary optional; options shown depend on category (= RS-2). | Gives RS-2 real meaning; no admin CRUD (Phase 2 optional). |
| RS-5 | Draft autosave to `sessionStorage` (text + pin, not photo) + `beforeunload` warning. | `useBlocker` needs a data router; the app uses `BrowserRouter`. |
| Commits | Agents commit only to their own local branch. No push, no PR until the user asks. | Repo rule. |

## Git safety (local only)
- All work happens on local branches: `improve/base` → 7 agent worktree branches → `improve/integration`. `main` is not touched during any phase.
- Forbidden for the main session and every agent: `git push`, `gh pr create`, any `gh` write, `git remote` changes, `vercel`/deploy commands, `supabase db push`/`link` against the shared project.
- Last step, only after the user says everything is okay: `git checkout main && git merge --no-ff improve/integration` locally. Pushing stays the user's call.
- The uncommitted name-validation work moves with the checkout to `improve/base`; it reaches `main` only through that final local merge.
- Worktrees and branches are removed locally after the merge (`git worktree remove`, `git branch -d`), only with the user's go-ahead.

## Phase 0: seams (main session, sequential, must end green) — DONE
`present()` now lives in `reports.common.ts`. The hooks router is mounted before `express.json()` so webhook handlers get the raw body.
1. Branch `improve/base` from `main`. (The name-validation work was already committed as `148360d`.)
2. Update `IMPROVEMENT_REQUIREMENTS.md`: Status column (Existing/Partial/Gap), fix links (`../../README.md`, `../API.md`, `../Final_Project.md`), decisions table above, full migration list.
3. `bun add @vis.gl/react-google-maps jspdf jspdf-autotable express-rate-limit standardwebhooks` (no lockfile conflicts later).
4. Split `src/server/services/reports.service.ts` (pure moves, no logic change); keep `reports.service.ts` as a re-export barrel so imports and tests stay unchanged:
   - `reports.common.ts`: `findReport`, `REPORT_FIELDS`, `recordUpdate`, `reportLabel`, notice helpers. **Frozen in Phase 1.**
   - `reports.access.ts`: `assertCanView/Update/Edit`, plus new `scopeReportQuery(query, user)` extracted from `reports.routes.ts:89-90`.
   - `reports.submission.ts`: `editReport`, `cancelReport`, `assertCategorySelectable`, `notifyNewReport`.
   - `reports.workflow.ts`: `NEXT_STATUS`, `STATUSES`, `STAFF_STATUSES`, `PUBLIC_STATUSES`, `changeStatus`, `assignStaff`, `addRemark`.
5. Split `reports.routes.ts`: base file keeps list/get/updates/photos and mounts `reports.submission.routes.ts` (POST /, PATCH /:id, POST /:id/cancel, `createSchema`, `editSchema`) and `reports.workflow.routes.ts` (status, assign, remarks, `statusSchema`, `remarkSchema`). Re-export schemas from `reports.routes.ts`.
6. Extract `AssignDialog` (AdminReports.tsx:192-338) → `components/AssignDialog.tsx`; `CancelDialog` (MyReports.tsx:237-326) → `components/CancelDialog.tsx`.
7. Stub routers mounted in `app.ts`: `hooks.routes.ts` `/api/hooks` (S1), `staff.routes.ts` `/api/staff`, `exports.routes.ts` `/api/exports`, `feedback.routes.ts` `/api/feedback`, `maintenance.routes.ts` `/api/maintenance`.
8. Add env names (no values) to `.env.example` and optional reads in `src/server/config/env.ts`: `VITE_GOOGLE_MAPS_API_KEY`, `SEND_SMS_HOOK_SECRET`, `SMS_PROVIDER`, `SMS_API_KEY`. Both files frozen in Phase 1.
9. Create `docs/updates/handoffs/TEMPLATE.md` (sections: Requirement status, Breadcrumbs for Phase 2, Doc changes, Migration notes, Check results, Limitations).
10. `bun run typecheck && bun test && bun run build` → green → commit "Prepare seams for parallel improvement work".

## Phase 1: 7 agents (one message, `isolation: "worktree"`, general-purpose)
Migration slots are fixed. No migration alters another stream's columns.

| ID | Section / reqs | Owns (edit only these + new files it creates) | Migration slot |
| :--- | :--- | :--- | :--- |
| S1 Accounts | UA-2..11 (UA-1 doc → P2) | `routes/auth.routes.ts`, `routes/admin.routes.ts`, `middleware/auth.ts`, `lib/validate.ts`, `hooks.routes.ts`, new `lib/rate-limit.ts`, `lib/sms.ts` (provider adapter); web `Register.tsx`, `SignIn.tsx`, `AdminUsers.tsx`, `lib/auth.tsx`, `lib/api.ts`, `lib/names.ts`, `ContactNumberField.tsx`, new `PasswordRules.tsx`, `IdleTimeoutDialog.tsx`, `ResidencyReview.tsx`; `supabase/config.toml` [auth]; tests `validation.test.ts` (non-report blocks), `auth.test.ts` | `20261003000200_accounts.sql`: name split + backfill, barangay, address, `residency_status`, proof path, reviewer, private bucket `residency-proofs` |
| S2 Maps | MP-1, MP-2 (+3/4) | `MapPicker.tsx`, `ReportMap.tsx`, `BoardReportCard.tsx`, `Board.tsx`, new `lib/maps.ts`, new `LocationMap.tsx` (read-only), `main.tsx`, new `src/server/lib/makati.ts` + boundary GeoJSON, `tests/leaflet.test.ts`, new `tests/fast/makati.test.ts` | `20261003000600_makati_bounds.sql`: bbox CHECK on reports, `NOT VALID` |
| S3 Submission | RS-1..5, cancel reason | `NewReport.tsx`, `ReportDetail.tsx`, `CancelDialog.tsx`, `PhotoPicker.tsx`, new `VoiceInput.tsx`, `lib/useDraft.ts`; `reports.submission.ts`, `reports.submission.routes.ts`; tests: report-schema blocks of `validation.test.ts`, new `submission.test.ts` | `20261003000300_problem_types.sql`: table + seed, `reports.primary_problem_id`, `secondary_problem_id` |
| S4 Workflow | SW-1..6, staff reasons | `reports.workflow.ts`, `reports.workflow.routes.ts`, `staff.routes.ts`, `StaffReport.tsx`, `AssignDialog.tsx`, **sole editor** of `ui.tsx` (StatusBadge), `app.css` (success/warning tokens), web `lib/types.ts` (status constants); new `SpecializationEditor.tsx`, `VerificationPanel.tsx`, `lib/activity-labels.ts`; `lib/activity.ts`; `functional.test.ts` | `20261003000400_workflow.sql`: `staff_specializations`, `assigned_at`, `closure_requested_at/_by`, `closure_outcome` check in (`resolved`,`rejected`), `closure_reason`, `verified_by/_at`, `update_type` values |
| S5 Data | DM-1, DM-2 | `lib/photos.ts` (null URL when purged), `maintenance.routes.ts`, `tests/browser/cleanup.ts` (child-first delete order), new `tests/fast/no-delete.test.ts` (no `.delete(` in `src/server` except storage purge) | `20261003000100_no_delete.sql`: cascade → restrict (photos, updates, inspections, notifications, profiles→auth.users), `report_photos.purged_at` |
| S6 Tables | TB-1..4 | new `components/data-table/*` (numbered pages + jump, column menu persisted in localStorage with try/catch, top-right toolbar, export menu), new `lib/export.ts` (CSV formula-injection escaping, PDF via jspdf-autotable); `AdminReports.tsx`, `StaffQueue.tsx`, `MyReports.tsx`, `AdminLogs.tsx`, `lib/query.ts`, `exports.routes.ts` (uses `scopeReportQuery`, cap 5000), `query-safety.test.ts` | none |
| S7 Feedback | FB-1 | `feedback.routes.ts` (POST by owner when resolved, one per report, immutable; GET for owner/assignee/admin; notifies assignee; `logActivity`), new `FeedbackForm.tsx`, `FeedbackSummary.tsx`, `lib/feedback.ts`, `tests/fast/feedback.test.ts` | `20261003000500_feedback.sql`: `report_feedback` |

### Contract inlined in every agent prompt
- First: confirm `git log -1` equals the Phase 0 commit; stop and report if not. Run `bun install`.
- Read this plan, `IMPROVEMENT_REQUIREMENTS.md`, `AGENTS.md`, then only owned files.
- **Do not edit files outside the Owns column.** A needed outside change → write it as a breadcrumb (file + exact change) in `docs/updates/handoffs/<ID>.md`. Docs (`docs/*.md`) are Phase 2 only.
- New web types go in a new stream file (e.g. `lib/accounts-types.ts`), not `types.ts` (S4 excepted).
- Never run `supabase db push`, never use the shared Supabase project, never copy `.env`. Never `git push`, open PRs, change remotes, or deploy; never checkout or merge into `main`.
- Skills: `web-engineering` + `web-design-guidelines` for any UI; `frontend-design` for new components, staying inside `ds.css` (no new palette except S4 tokens); `ask-bug-finder` when a check fails; `ask-code-reviewer` on own diff before finishing.
- Simplest option that meets the requirement; record every judgment call in the handoff.
- Done = `bun run typecheck`, `bun test`, `bun run build` green in the worktree; focused commits on own branch ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; handoff file written.

## Phase 2: integration breadcrumbs (main session, after all 7 finish)
- Merge into `improve/integration` in order S5 → S1 → S3 → S4 → S2 → S7 → S6; run `bun run typecheck && bun test` after each merge.
- Known breadcrumbs (plus everything listed in the handoffs):
  - B1 `rejected` status: enum value, server/web lists + labels, StatusBadge tone, map pins, board/public view, filters, analytics, exports, closure outcome path.
  - B2 Makati validation (`makati.ts`) into `createSchema`/`editSchema`.
  - B3 `LocationMap` into ReportDetail + StaffReport; remove `leaflet`, `react-leaflet`, `@types/leaflet`, `lib/leaflet.ts`, Leaflet CSS import.
  - B4 FeedbackForm → ReportDetail; FeedbackSummary → StaffReport; optional rating in analytics.
  - B5 AdminUsers: SpecializationEditor, DataTable adoption.
  - B6 New columns + export fields: assigned_at, delay, verification state, problems, rating, barangay, residency flag.
  - B7 SW-1 area routing by barangay (or document as limitation).
  - B8 "Photo removed after retention period" on detail pages.
  - B9 Activity labels in AdminLogs; `logActivity` for feedback, residency review, closure actions.
  - B10 Fold stream type files into `types.ts`.
  - B11 Idle sign-out keeps the NewReport draft (manual check).
  - B12 Tests: Playwright suites (email-verified registration, Google map selectors, required comments, verification flow), `scripts/demo` flow, fixture accounts (verified residents, specializations).
  - B13 Docs: FRONTEND, API, ARCHITECTURE, DEVELOPER_JOURNEYS state machine, UA-1 roles/permissions, requirement statuses; delete `docs/updates/handoffs/`.
- Then `/code-review high` + `/security-review` on the integration branch; fix findings.
- Report results to the user. On their "okay": local merge into `main` (see Git safety). No push.

## Verification
- Per stream: typecheck, `bun test`, build (no live DB needed; tests use placeholder env).
- Integration: the migration owner (user) applies all migrations on a **disposable/local** Supabase (`bunx supabase db push --dry-run` first), configures SMTP + Maps key + Send SMS Hook URL/secret, then `bun run test:security`, `bun run test:browser`, and `/verify-kamoti` for screenshots of: Makati-only pins (Bataan rejected), register → 6-digit email code → phone code (test OTP) → residency review, required comments, request→verify resolution, rejected status, numbered pages/column toggle/CSV+PDF export, feedback reaching staff, idle timeout warning, draft restore.

## Risks
- Worktree base may not be the Phase 0 commit → each agent checks first.
- Migrations unapplied during Phase 1 → DB bugs surface only in Phase 2; unit tests carry Phase 1.
- Email confirmation and stricter passwords break existing browser fixtures → B12.
- Makati boundary must reflect the 2023 EMBO transfer to Taguig; S2 cites its source.
- Maps key ships in the browser bundle by design → referrer + API restrictions are mandatory.
- Phone OTP on hosted Supabase may need the phone provider toggled on even with the hook; S1 confirms and records it. Real PH delivery depends on the gateway the team picks.
- S1 is the heaviest stream (accounts + email/phone OTP + residency); it reports partial completion per UA ID rather than cutting corners.
- Cost: 7 Opus agents in parallel is token-heavy. S5 and S7 are light; S1 and S4 are heavy.

## Compliance
| Check | Result |
| :--- | :--- |
| Plan ≤ 200 lines, declarative | Yes |
| Single owner per file/table | Yes: Owns column; frozen `reports.common.ts`; docs → Phase 2 |
| Foundation before UI | Phase 0 seams before any feature |
| Overlaps deferred | B1–B13 in Phase 2 |
| Alternatives justified | User Review table |
| Mandatory verification | Verification section |
