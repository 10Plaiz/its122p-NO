# KAMOTI Phase 2: team handoff

Written 2026-10-04. Covers the instructor-review improvements from checkpoint C1 to C9 and what is left. Branch: `improve/integration`. `main` is untouched at `afb2d51`.

Details live in other files; this one points to them:
- **Plan:** [PHASE2_PLAN.md](PHASE2_PLAN.md)
- **Requirements, decisions:** [docs/updates/IMPROVEMENT_REQUIREMENTS.md](docs/updates/IMPROVEMENT_REQUIREMENTS.md)
- **Issues:** [ISSUES.md](ISSUES.md)
- **Proposal (scope):** [docs/Final_Project.md](docs/Final_Project.md)

## 1. Where the code is
| Part | State |
| :--- | :--- |
| Streams S1 to S7 and C1 to C6 | Committed and on GitHub (up to `e93a8a8`) |
| C7, C7b, C8, C9 | **In the working folder, not committed.** Commit in this order: [COMMITS_C7.md](COMMITS_C7.md) → [COMMITS_C7b_C8.md](COMMITS_C7b_C8.md) → [COMMITS_C9.md](COMMITS_C9.md). Each list was replayed; every commit passes typecheck, `bun test`, and build. |
| Checks on the full working tree | typecheck pass · `bun test` 517 pass · build pass, main chunk about 440 kB · security suite 39/39 (local) |
| Shared Supabase project | **None of the 9 new migrations is applied yet** (see section 5) |

## 2. Team rules (keep these)
- Never `git add -A` or `git add .` in this folder: `.claude/worktrees/` would be staged. Add exact paths.
- Never run `supabase db push` or `supabase link` against the shared project without the migration owner. Test migrations on a local Supabase (`bunx supabase start`).
- Browser tests save screenshots to the **committed** `tests/evidence/` unless `EVIDENCE_DIR` points elsewhere. Always set it for local runs. `tests/evidence-deployed/` is cited by the Phase 4 report; do not overwrite it.
- Browser and security tests clean up their test data. Pass the local `SUPABASE_URL` and `SUPABASE_SECRET_KEY` explicitly, or they fall back to `.env` (the shared project).
- Each new feature updates `docs/Final_Project.md` and `docs/updates/IMPROVEMENT_REQUIREMENTS.md`.
- Rows are never deleted (DM-1). Accounts are deactivated, not deleted.

## 3. What changed, C1 to C9
| Step | Requirements | What people see | Main files |
| :--- | :--- | :--- | :--- |
| C1 | DM-2, SW-6, RS-4 | Report pages read problems, workflow dates, and removed-photo state from the report itself. A purged photo shows "photo removed after the 90-day retention period". | `services/reports.common.ts` (`REPORT_FIELDS`) |
| C2 | MP-2 | Pins are Makati-only in the browser (device location and drafts too), the API, and a database check. Fixture and test pins moved from Manila. | `routes/reports.submission.routes.ts`, `web/lib/report-rules.ts`, `scripts/fixture/reports.ts` |
| C3 | MP-1, SW-5 | Google Maps everywhere; Leaflet removed. Resolved pins are green with a check. | `components/LocationMap.tsx`, `StatusPin.tsx` |
| C4 | SW-7 | New **Rejected** status: staff ask from under review or in progress with a reason; an admin approves or returns. The citizen and the public board see the reason. | `services/reports.workflow.ts`, `VerificationPanel.tsx`, migrations `…000700`, `…000710` |
| C5 | RS-6, FB-1 | Citizens comment on their own reports at any status (10 an hour; staff and admins notified). Rating form on resolved reports; ratings on the staff page, queue, and dashboard. | `routes/reports.workflow.routes.ts`, `FeedbackForm.tsx` |
| C6 | TB-2, TB-4, SW-3, SW-6, SW-1 | Optional table columns (problems, days in stage, residency, rating…); "Closed" date column. Activity log in plain words with server filters. Staff specializations editable. | `data-table/report-columns.tsx`, `lib/log-filters.ts`, `AdminLogs.tsx` |
| C7 | SW-1 | Every report gets its barangay from the pin (OpenStreetMap boundaries). Staff areas under **Users → Routing**. Assign lists category and barangay matches first. Barangay filter on the board, All reports, and My queue. | migration `…000800`, `routes/staff.routes.ts`, `AreaEditor.tsx`, `BarangayFilter.tsx` |
| C7b | DM-2 | Dashboard **Photo retention**: check, then remove expired photos after a confirmation. | `PhotoRetention.tsx` |
| C8 | B12 | Browser tests updated and 7 account-flow tests added (Mailpit). Security tests IMP-01 to IMP-09. Demo seed citizens verified; fixture reports complete. | `tests/browser/*`, `tests/integration/security.ts`, `scripts/demo/workflow-columns.ts` |
| C9 | UA-13, KI-10/13/16/18/20/21 | **My account** page: citizens edit name, number, barangay, street. Sign-out ends expired sessions. Clearer reset-code error. Greyed home button when locked. PDF text clean-up. Staff and admin pages lazy-loaded. | `pages/Account.tsx`, `routes/auth.routes.ts`, `routes.tsx` |

Earlier streams (S1 to S7: accounts and residency, maps, submission, workflow, data, tables, feedback) are described in `docs/updates/handoffs/S1.md` to `S7.md`.

## 4. Decisions to know
| Topic | Decision |
| :--- | :--- |
| Residency (UA-8) | A citizen without a proof, or with a rejected one, is locked to the upload step. Sending a proof unlocks at once; an admin reviews. |
| Changed address (UA-13) | Back to "not yet reviewed", still usable. An account verified with no proof file is asked for one first. |
| Changed number | Loses its verified mark; the log keeps the old and new number. |
| Rejected reports (SW-7) | Shown on the public board with the reason; requestable from under review or in progress; not ratable. |
| Comments (RS-6) | Own reports only, any status; staff and every admin notified; 10 an hour. |
| Area routing (SW-1) | Ranked suggestions only; the admin chooses. Barangay shown and filterable on the board. |
| Phone OTP (UA-6) | Deferred (no SMS budget). Admins mark numbers verified. |
| Type-file tidy-up (B10) | Dropped: no behaviour change, high churn. |

All decisions, with dates, are in the Decisions table of `IMPROVEMENT_REQUIREMENTS.md`.

## 5. Database: 9 new migrations
Apply in this order on a local or disposable project first (`bunx supabase db push --dry-run`), then on the shared project, **before** deploying the code. The code reads these columns on every sign-in and report page.

| Migration | Adds |
| :--- | :--- |
| `20261003000100_no_delete` | Restrict deletes; `report_photos.purged_at` |
| `…000200_accounts` | Name parts, barangay, street, consent, phone verified, residency columns; private `residency-proofs` bucket |
| `…000300_problem_types` | Problem types per category; main and other problem on reports |
| `…000400_workflow` | Staff specializations; assigned, status-changed, closure request, and verification columns |
| `…000500_feedback` | `report_feedback`, `feedback_summary()` |
| `…000600_makati_bounds` | Makati bounding-box check (NOT VALID) |
| `…000700_rejected_status` | `rejected` report status |
| `…000710_public_rejection_reason` | Rejection reason on the public view |
| `…000800_area_routing` | `barangays` (23 polygons), barangay trigger and backfill, `staff_areas`, barangay on the public view |

Before or right after `…000600`: move any report pinned outside Makati, then `alter table reports validate constraint reports_within_makati_bbox;`.

## 6. Run it locally
```bash
bunx supabase start                              # local Supabase in Docker; Mailpit at http://127.0.0.1:54324
bunx supabase status -o env                      # local URL and keys; pass them as SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
bun run fixture -- --target 127                  # fixture accounts and reports (prompts for a password)
bun run dev                                      # API :4000, web :5173
bun run typecheck && bun test && bun run build
EVIDENCE_DIR=/tmp/kamoti FIXTURE_PASSWORD=... npx playwright test
FIXTURE_PASSWORD=... bun run test:security -- --target 127
```
- **Maps:** set `VITE_GOOGLE_MAPS_API_KEY` in `.env`. Without it the maps show "Map unavailable", the report form still works with "Use my location", and two map tests skip.
- **Demo seed:** `seed:apply` targets hosted projects only.

## 7. Gaps to fill
### Must do before deploying (P1)
| Gap | Owner | Where |
| :--- | :--- | :--- |
| Commit and push C7, C7b/C8, C9 | Repo owner | `COMMITS_C7.md` → `COMMITS_C7b_C8.md` → `COMMITS_C9.md` |
| Apply the 9 migrations to the shared project, in order | Migration owner | Section 5; KI-01 |
| Hosted Supabase Auth: Confirm email on, custom SMTP, OTP length 6, templates from `supabase/templates/`, password minimum 8 with letters and digits | Migration owner | KI-02. Registration answers 503 until this is done. |
| Google Maps key on Vercel, restricted by site and API, with daily quotas | Key owner | KI-03 |
| Re-run `seed:apply` on the hosted demo project so demo citizens become verified | Seed owner | KI-05 |

### Not yet verified
- Full browser suite after C9 (the C8 run passed 41, skipped 1; C9 was spot-checked only).
- Anything on the shared project: migrations, the security suite, the browser suite.
- A second rating answering 409, live (covered by a unit test only).
- New `/verify-kamoti` evidence for the presentation (use a new folder, as with `tests/evidence-deployed/`).

### C10 documentation (KI-22)
- `docs/API.md`: new endpoints:
  - `PATCH /api/auth/me`, the logout body, `/auth/me/residency-proof`
  - admin residency and phone routes
  - `/api/staff` with `?barangay=`, `/api/staff/:id/areas`, `/api/staff/:id/specializations` (PUT)
  - closure request and review with `rejected`
  - remarks for citizens
  - feedback routes, exports, log filters, `?barangay=` on the lists, the maintenance purge
- `docs/FRONTEND.md`:
  - My account, Routing, Photo retention
  - table columns, badges, lazy pages
- `docs/ARCHITECTURE.md` and ERD: the new tables and the barangay trigger.
- `docs/DEVELOPER_JOURNEYS.md`: the state machine with the closure request and `rejected`.
- `docs/LOCAL_DEV.md`: local Supabase, Mailpit, Maps key, `EVIDENCE_DIR`.
- UA-1: one roles and permissions table.
- UA-10: security review write-up, including the accepted risks:
  - in-memory rate limits (KI-14)
  - refresh token in localStorage (KI-12)
  - code requests revealing accounts (KI-15)
  - rejection notes overwritten (KI-17)
  - SMS deferred (KI-11)
- Afterwards: update requirement statuses, then delete `docs/updates/handoffs/` and `docs/updates/PARALLEL_PLAN.md`.

### C11 review and merge
- Run `/code-review high` and `/security-review` on `improve/integration`, then fix and re-test.
- On the team's go-ahead: `git merge --no-ff improve/integration` into `main`.
- Clean-up after the merge:
  - Remove the 8 old worktrees under `.claude/worktrees/` (`git worktree remove`).
  - Delete the stream branches `improve/s1…s7` and `backup/pre-rewrite`.
  - Delete the `COMMITS*.md` files once committed.

### Known limits (documented, not built)
- Email address changes are not self-service, and there is no admin screen for them either.
- Staff and admins cannot edit their own details; an admin edits them on Users.
- No scheduled photo purge (a Vercel cron needs deployment settings).
- No admin screen to add or retire problem types; they are seeded.
- Area routing suggests only; there is no auto-assignment.
- A Vercel preview of this branch on the shared database breaks sign-in until the migrations are applied.
