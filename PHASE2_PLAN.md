# Phase 2 plan: finish the improvements

Written 2026-10-03 after reviewing commits `d27fd46..888e112`, [HANDOFF.md](HANDOFF.md), [COMMITS.md](COMMITS.md), [ISSUES.md](ISSUES.md), and `docs/updates/handoffs/S1–S7.md`. Untracked note, like HANDOFF.md.

## 0. Starting state (verified)
- `improve/integration` = `888e112`, same as `origin/improve/integration`. Pushed by the user.
- The four COMMITS.md commits are in. Code matches the backup tag `backup/s1-session-2026-10-03` exactly; the only extra file is `handoffs/S1.md`.
- Checks on `888e112`: `bun run typecheck` pass · `bun test` 425 pass / 0 fail · `bun run build` pass (old chunk-size warning).
- Untracked: `COMMITS.md` (done), `HANDOFF.md`, `ISSUES.md`. The S1 worktree still holds an uncommitted duplicate of S1b/S1c.

## 1. Conflict audit
| Tier | Conflict | Action |
| :--- | :--- | :--- |
| 1 Runtime | `src/web/pages/NewReport.tsx:11` imports `reverseGeocode` from `lib/leaflet.ts`. The B3 note says to delete `leaflet.ts`, which would break the new-report form. | C3: move `reverseGeocode` to `lib/geocode.ts` first. |
| 1 Runtime | The pushed branch reads S1a columns in `requireAuth`. A Vercel preview of `improve/integration` on the shared database breaks every sign-in until migration `…000200` is applied. | User: do not open or share previews before KI-01. |
| 1 Runtime | Fixture seed fails on out-of-Makati pins (KI-04). | C2 (D1). |
| 2 Drift | API, FRONTEND, ARCHITECTURE, and LOCAL_DEV docs predate S1–S7. | C10. |
| 2 Drift | Browser tests, demo seed, and security tests use old flows. | C8. |
| 3 Stale | HANDOFF.md said S1b/S1c were uncommitted; COMMITS.md described commits already made. | Fixed: HANDOFF updated, COMMITS.md deleted (C0). |

## 2. Rules (from HANDOFF.md §1)
- Local only: no push, no PR, no deploy, no `supabase db push`/`link` on the shared project. Local `supabase start` is fine.
- Work one checkpoint at a time in the main checkout, with no parallel agents. Pause for approval after each checkpoint.
- Leave work uncommitted. Write that checkpoint's commit groups into COMMITS.md, with each group passing checks on its own.
- Never `git add -A`. The stack stays React + Vite + Express + Supabase. The Next.js skill's conventions do not apply here.
- Scope: each checkpoint that adds or changes a feature also updates `docs/Final_Project.md` (features, roles, data model) and `docs/updates/IMPROVEMENT_REQUIREMENTS.md`.
- COMMITS.md: delete it and write a new one at the end of every checkpoint.
- UI work follows the web-engineering rules: labels, inline errors, `aria-live`, focus-visible, `Intl` dates, and no colour-only status.

## 3. Checkpoints (in order; ⚑ marks the critical path)
| # | Checkpoint | Reqs / items | Issues | Weight |
| :--- | :--- | :--- | :--- | :--- |
| C0 ✅ | Housekeeping | — | — | XS |
| C1 ✅ | Report data foundation | REPORT_FIELDS, `cancelReport` | KI-09 | S |
| C2 ✅ | Server Makati check and pins | MP-2, B2 | KI-04 | S |
| C3 ✅ | Google Maps on report pages; remove Leaflet | MP-1, SW-5, B3 | KI-09 | M |
| C4 ⚑ | `rejected` status | SW-7, B1 | KI-09 | L |
| C5 | Report page wiring and citizen comments | FB-1, RS-6, SW-3/6, B4 | KI-09 | M |
| C6 | Tables, admin users, logs | TB, SW-1, B5, B6, B9 | KI-09 | L |
| C7 | Area routing by barangay | SW-1, B7 | KI-09 | L |
| C7b | Leftovers | DM-2 purge UI, B10 | KI-09 | S |
| C8 | Tests and seeds | B12 | KI-05–08 | L |
| C9 | Citizen self-edit, polish, cheap hardening | UA-13, UA-10/11 | KI-10, 13, 16, 18, 20, 21 | M |
| C10 | Documentation | UA-1, UA-10, B13 | KI-22 | M |
| C11 | Review and merge | — | — | M |

Why this order: C1 adds the fields that C4–C6 read. C2 must land before C8, because test pins move. C4 changes the status set that C5 badges, C6 columns, and C8 tests use.

## 4. Proposed changes per checkpoint
### C0 Housekeeping ✅ (2026-10-03)
- Deleted COMMITS.md and the backup tag. Discarded the S1 worktree copy after confirming all 48 files matched `888e112`. `ISSUES.md` stays untracked; it is an optional group in COMMITS.md.
- Recorded the decisions in IMPROVEMENT_REQUIREMENTS: new UA-13 and RS-6, SW-1 area required, and 4 new decision rows.

### C1 Report data foundation ✅ (2026-10-03)
- REPORT_FIELDS gained the workflow columns, the problem joins, and `photos.purged_at`. `present()` gives purged photos `url: null`. `problemIdsOf()` replaces two lookups, and `GET /:id/problems` is removed.
- `cancelReport` stamps `status_changed_at`. ReportDetail reads the problems from the report. `RemovedPhoto` shows on both report pages (B8 done).
- `/workflow` stays for StaffReport (requester/verifier names and delay). Checked on local Supabase in C2.

### C2 Server Makati check ✅ (2026-10-03)
- `createSchema` and `editSchema` end with `refineInsideMakati`. The web `pinError()` disables Continue/Save for a device location or draft outside Makati; the reason also shows when the map cannot load.
- Pins moved to Makati in tests and the fixture. The fixture reports are now in `scripts/fixture/reports.ts`. Tests cover the fixture and demo pins.
- Local run: fixture OK; bbox constraint validated. API: Bataan/Pembo 400, Ayala 201, moving the pin out 400, title-only edit 200. Browser: 7/7.
- Left for C8: fixture reports have no main problem; `security.ts` posts no `primary_problem_id`. The local stack now runs from the main checkout.

### C3 Google Maps on the report pages ✅ (2026-10-03)
- ReportDetail and StaffReport use `LocationMap`. `StatusPin` is shared with the board; resolved pins are `--color-success-700` with a check.
- Leaflet packages, `lib/leaflet.ts`, and its CSS are removed (`reverseGeocode` was already in `maps.ts`). `tests/leaflet.test.ts` became `tests/geocode.test.ts`.
- Local run with the user's key: 8/8 browser checks, no console errors. Dialogs clear the map (`.gm-style` is z-index 0). The main chunk is about 492 kB, so the build warning is gone.
- Left for C8: `tests/browser/citizen.browser.ts` and the verify-kamoti feature notes still target `.leaflet-container`.

### C4 `rejected` status (SW-7)
- New migration `supabase/migrations/20261003000700_rejected_status.sql`:
  - `alter type report_status add value 'rejected'`. This must run outside a transaction that also uses the new value.
  - Re-check the closure CHECKs from `…000400`, and the `public_reports` view and filters from `…000006`.
- Server:
  - `reports.workflow.ts`: `CLOSURE_OUTCOMES`, `OUTCOME_STATUS.rejected`, and a required reason.
  - Notify the citizen with the reason.
  - Update `retention.ts` and `analytics.ts` status lists, plus export and list filters (grep for `"cancelled"`).
- Web:
  - `types.ts` status union and labels.
  - StatusBadge for `rejected`: its own tone, icon, and word.
  - StaffReport "Request rejection" dialog with a required reason.
  - Admin approve and return work the same as for resolution.
  - Board/public view, filters, and the citizen's ReportDetail show the reason.
- Rules:
  - `resolved_at` stays null for a rejected report.
  - The completion column shows `verified_at` as "Closed".
  - Rejected reports cannot be rated (decision D2).
- Tests: closure-review with outcome `rejected`, the required reason, a 409 race, and the label in `activity-labels.ts`.

```mermaid
sequenceDiagram
  Staff->>API: POST /reports/:id/closure-request {outcome:"rejected", comment}
  API->>DB: closure_requested_at, closure_outcome=rejected; log + update row
  Admin->>API: POST /reports/:id/closure-review {decision:"approve", comment}
  API->>DB: status=rejected, verified_at (guarded; 409 on race)
  API-->>Citizen: notification with the reason
```

### C5 Report page wiring and citizen comments
- RS-6: `POST /:id/remarks` also accepts the citizen who owns the report, at any status (no new route). It notifies the assigned staff member, and both timelines show it.
- ReportDetail:
  - Show `<FeedbackForm report />` to the owner (resolved only).
  - Timeline uses `updateTypeLabel()`; show the "Awaiting verification" badge.
  - Add a comment box for the owner.
- StaffReport: add `<FeedbackSummary report />` between the workbench and History.
- Optional: `RatingAverage` on StaffQueue and AdminDashboard.
- Scope: Final_Project.md citizen features (comments, rating).

### C6 Tables, admin users, logs
- B6: optional columns in `report-columns.tsx` and the export select:
  - Main and other problem, Assigned, Delayed, and Awaiting verification.
  - Rating (`feedback:report_feedback ( rating, comment )` in the table and export select only).
  - Barangay/residency and phone verified.
- B5 AdminUsers:
  - Server paging on `/admin/users`, then use `DataTable` and `NumberedPagination`.
  - Keep the residency column and filter, `ResidencyReview`, and "Mark verified".
  - Add an "Edit specializations" action that opens `SpecializationEditor`.
  - Add `api.put()` and drop the PATCH alias in `staff.routes.ts`.
- B9 AdminLogs:
  - Show `activityLabel(action)`.
  - Add server-side search and date filters on `/admin/logs`, so the export matches the screen.

### C7 Area routing by barangay (SW-1, B7; ranked suggestions)
- Migration `…000800`: a `barangays` table (23 Makati barangays with simplified OSM polygons), `reports.barangay_id`, and a `staff_areas` table (RLS, service_role only).
- The server derives the barangay from the pin on create and edit, and backfills existing reports.
- Admins set staff barangays next to specializations. `/api/staff` ranks staff who match both the category and the barangay first.
- Barangay appears as a column and filter in tables and exports, and in Final_Project.md (roles, data model).

### C7b Leftovers
- DM-2: AdminDashboard "Check photo retention" (dry run) → "Remove expired photos", with a confirmation. A Vercel cron is optional and needs the user.
- B10: fold the stream type files and `ResidencyStep` into `lib/types.ts`.

### C8 Tests and seeds
- KI-05: seed demo citizens as `verified`. The demo flow closes reports through a closure request plus approval. Update `tests/fast/demo-seed.test.ts`.
- KI-06: update `tests/browser/*`:
  - Register uses the split-name fields.
  - Comments are required on status changes.
  - Closure goes through request and verification.
  - Cancellation needs a reason; the new report needs a main problem.
  - Add the table selectors.
- KI-07: new account flows:
  - Mailpit code, proof lock and redirect, reject and re-upload.
  - Unconfirmed sign-in, reset, refresh, and idle sign-out.
  - Start from `s1-run.ts`, which is in the old session's scratchpad; if it is gone, rebuild it from the selectors in `handoffs/S1.md`.
- KI-08: `tests/integration/security.ts`:
  - `residency_required` 403s.
  - The private `residency-proofs` bucket.
  - `report_feedback` and `feedback_summary` closed to direct clients; feedback 403/400/409.
  - The `rejected` transition rules.

### C9 Polish and cheap hardening
- KI-18: on Entry, grey out citizen buttons when `residencyLocked(user)`, with a reason.
- KI-16: after a failed reset, say "Ask for a new code".
- KI-13: logout refreshes first, or revokes by refresh token. Add a test that the old refresh token fails.
- KI-21: `React.lazy` admin and staff pages in `routes.tsx`, with a `Suspense` fallback "Loading…".
- KI-20: replace characters outside WinAnsi ("→" becomes "->", emoji are dropped) before the PDF render.
- Documented, not built: KI-11, KI-12, KI-14, KI-15, and KI-17. These go in the UA-10 security review (C10).
- UA-13 / KI-10: `PATCH /api/auth/me` and an account page, using the registration rules. The rules for a changed phone number or address are asked when this is built.

### C10 Documentation (B13, KI-22)
- Apply each handoff's "Doc changes" list to `docs/API.md`, `FRONTEND.md`, `ARCHITECTURE.md`, `DEVELOPER_JOURNEYS` (state machine with `rejected`), and `LOCAL_DEV.md` (local Supabase, Mailpit, maps key).
- UA-1: one roles and permissions table. UA-10: security review write-up.
- Update the statuses in `IMPROVEMENT_REQUIREMENTS.md`. Then delete `docs/updates/handoffs/` and `PARALLEL_PLAN.md`.

### C11 Review and merge
- `/code-review high` and `/security-review` on `improve/integration`. Fix the findings and report them.
- Run `/verify-kamoti` on local Supabase for the evidence.
- On the user's "okay": a local `git merge --no-ff improve/integration` into `main`. Then the worktree cleanup in HANDOFF.md §11.

## 5. User-only track (runs alongside; blocks deploy, not local work)
| Item | Blocks | Note |
| :--- | :--- | :--- |
| KI-01 migrations `…000100–000600`, then `…000700` from C4 | Deploy | Dry run on local first; fix pins, then `validate constraint`. |
| KI-02 SMTP, Confirm email, OTP length 6, templates | Registration on the hosted project | Until then registration answers 503 on purpose. |
| KI-03 Google Maps key and restrictions | Maps on the deployed site | Browser tests without a key see the fallback. |

## 6. Decisions (answered 2026-10-03)
| ID | Decision |
| :--- | :--- |
| D1 | C2 fixes the pins; every pin must be in Makati. |
| D2 | Citizens comment on their own reports at any status (RS-6). Ratings stay resolved-only. A rejected report shows "Closed" (`verified_at`). |
| D3 | Area routing is built (C7) as ranked suggestions. |
| D4 | UA-13 citizen self-edit is in scope (C9). |
| D5 | Work stays uncommitted. COMMITS.md is deleted and rewritten each checkpoint. Scope docs are updated with each feature. |

## 7. Verification plan (every checkpoint)
- Run `bun run typecheck`, `bun test`, and `bun run build`. While iterating, run a single file with the placeholder env from HANDOFF §9.
- For DB checkpoints (C2, C4, C8): run `bunx supabase start` and `bunx supabase db reset` locally, then check that all migrations apply. Then run `bun run fixture`.
- For UI checkpoints (C3, C4, C5, C6, C9): use `/verify-kamoti` on localhost for the touched pages. Check keyboard paths and the `aria-live` messages.
- C8 onward: `bun run test:browser` and `bun run test:security` against local Supabase only.
- Each report back covers what changed, review findings, check results, and anything left out.

## 8. Compliance audit
| Rule | Status |
| :--- | :--- |
| Under 200 lines; one owner per fact | Yes. Breadcrumb detail stays in `handoffs/S*.md` until C10 deletes them. |
| Exact diffs | Anchors and file:line are given here. Exact search/replace text is written at each checkpoint after reading the code (planning reads interfaces only). |
| Owners | Single executor (this session) with user approval; the migration owner has §5. Teammates take items through ISSUES.md IDs. |
| Trade-offs | Order (§3 note), B7 limitation (D3), P3 items documented rather than built (C9), and no Next.js patterns (stack rule). |
