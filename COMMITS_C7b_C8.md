# Commit instructions: Phase 2 C7b (photo retention) and C8 (tests and seeds)

Written 2026-10-04 on `improve/integration` at `e93a8a8`. Follow the steps in order. Nothing has been committed or pushed for you. `COMMITS.md`, `COMMITS_C6.md`, and `COMMITS_C7.md` are earlier lists and stay as they are.

**Order matters:** make the three C7 commits from `COMMITS_C7.md` first, then the commits below. C7b and C8 touch none of the files C7 lists, with one exception. Step 5 of `COMMITS_C7.md` stages these notes:
- `HANDOFF.md`
- `ISSUES.md`
- `PHASE2_PLAN.md`
- `docs/updates/IMPROVEMENT_REQUIREMENTS.md`

They now also record C7b and C8, so those lines go into the C7 docs commit. That is documentation only, and the checks are unaffected.

## What C7b and C8 do
| Part | What changes |
| :--- | :--- |
| C7b, DM-2 | Admin dashboard → **Photo retention**: "Check expired photos" says how many photos of reports cancelled more than 90 days ago would go. "Remove expired photos" asks again, inline, because files cannot be restored. Rows stay with `purged_at`, and report pages say the photo was removed. |
| C7b, B10 | **Dropped on purpose.** Folding the type files into `types.ts` changes no behaviour, touches most pages, and would have mixed into the C7 files. |
| C8, fixture | Fixture reports get their category's main problem, and the assigned one gets `assigned_at`. |
| C8, demo seed (KI-05) | Demo citizens are seeded as verified residents, and earlier ones are switched over on the next `seed:apply`. Names are split, and reports get their main problem and workflow dates. Resolved reports get a staff closure request verified by the admin, built from each report's own history (`scripts/demo/workflow-columns.ts`). The manifest is unchanged. |
| C8, browser tests (KI-06) | Brought up to date: split-name registration; main problem; required cancel reason; Google map controls. The report flows place their pin with a faked device location inside Makati, so they run with or without a Maps key. The two checks that need the real map skip without one. FUNC-02 now drives request → verify → resolved itself on a `[TEST]` report, instead of needing an old resolved one. |
| C8, account tests (KI-07) | New `tests/browser/accounts.browser.ts`, 7 tests: <br>• sign-up code (read from Mailpit) <br>• residency lock (greyed menu, redirect, 403) <br>• proof upload <br>• admin rejection with reason, then re-upload <br>• unconfirmed sign-in → code step <br>• password reset ending other sessions <br>• token refresh <br>• idle warning and sign-out <br>It skips unless Mailpit answers, so it never creates accounts on a shared project. |
| C8, security tests (KI-08) | `tests/integration/security.ts` gains IMP-01 to IMP-09: <br>• residency lock 403s <br>• private proofs bucket <br>• admin-only proof link <br>• closed `report_feedback`, `barangays`, `staff_areas`, and `feedback_summary` <br>• feedback 403/400 <br>• staff rating privacy <br>• rejection reason only on rejected reports <br>• comments on someone else's report refused <br>• Bataan pin refused <br>XSS-01 now sends a main problem. |
| C8, skill notes | The `/verify-kamoti` feature notes describe the Google map instead of Leaflet. |

## Checks
The whole sequence was replayed in a throwaway worktree: the C7 commits, then these. The replayed files matched this working tree.

| After | typecheck | bun test | build |
| :--- | :--- | :--- | :--- |
| The three C7 commits | pass | 502 pass / 0 fail | pass |
| Commit 1 (C7b) | pass | 502 pass / 0 fail | pass |
| Commit 2 (seeds) | pass | 506 pass / 0 fail | pass |
| Commit 3 (tests) | pass | 506 pass / 0 fail | pass |

### On local Supabase only, never the shared project
- **Database:** a fresh `supabase db reset` applies all 15 migrations, and `bun run fixture` re-seeds.
- **Browser suite** (`npx playwright test`): **41 passed, 1 skipped**. It was 28 passed, 6 failed, 1 skipped before C8. The skip is the board paging check, because the local database has less than one page of public reports.
- **Security suite** (`bun run test:security -- --target 127`): **37 of 37**. The fixture state was restored afterwards: citizen 2 is verified again, the fixture reports are back to their states, and no test rows or proof files are left.
- **Photo retention:** 8 of 8 on a `[TEST]` report cancelled 100 days ago:
  - The dry run reported "1 photo from 1 cancelled report" and kept the file.
  - Removal asked first, deleted the file, kept the row with `purged_at`, and the report page says the photo was removed.
  - No console errors.
- **Demo seed:** `seed:apply` only targets hosted projects, by design. Instead, one demo report of each status was inserted into the local database inside a rolled-back transaction. All passed the database's checks, and the resolved one has a complete, verified closure request.

## Important when running the browser tests
`captureEvidence` writes screenshots to `tests/evidence/`, which is committed. A run without `EVIDENCE_DIR` overwrites them. An early local run here did exactly that: 27 files were overwritten and then restored from git, and `tests/evidence-deployed/` was never touched. Point it elsewhere for local runs:
```bash
EVIDENCE_DIR=/tmp/kamoti-evidence FIXTURE_PASSWORD=... npx playwright test
```

## Step 1. Check where you are
```bash
git branch --show-current          # expect: improve/integration
git log --oneline -4               # expect your three C7 commits on top of e93a8a8
git status --short                 # expect the 15 files listed in steps 3 to 6, nothing else
```
If the C7 commits are not there yet, make them first with `COMMITS_C7.md`.

## Step 2. Run the checks yourself (optional but recommended)
```bash
bun run typecheck
bun test
bun run build
```
Expect 506 tests passing.

## Step 3. Commit the photo retention control (C7b)
Use exact paths. Never `git add -A` or `git add .`, because `.claude/worktrees/` would be staged.
```bash
git add src/web/components/PhotoRetention.tsx src/web/pages/AdminDashboard.tsx
git commit
```
Message:
```
feat(web): check and remove expired photos from the dashboard (DM-2)

"Check expired photos" runs the purge as a dry run and says how many
photos of reports cancelled more than 90 days ago would go. "Remove
expired photos" asks again inline, since files cannot be restored, then
says how many were removed. Report and photo rows stay (DM-1); pages
already say "photo removed after the 90-day retention period".
```

## Step 4. Commit the seeds (C8)
```bash
git add scripts/fixture/seed.ts scripts/demo/seed.ts scripts/demo/workflow-columns.ts tests/fast/demo-seed.test.ts
git commit
```
Message:
```
fix(seeds): verified demo citizens and complete report records

Demo citizens are verified residents (earlier ones are switched over
on the next apply), with split names. Demo and fixture reports get
their category's main problem and workflow dates; resolved demo
reports get the staff request and admin verification SW-4 requires,
taken from each report's own history. The demo manifest is unchanged.
```

## Step 5. Commit the tests and skill notes (C8)
```bash
git add tests/browser/helpers.ts tests/browser/auth.browser.ts tests/browser/citizen.browser.ts \
  tests/browser/staff.browser.ts tests/browser/accounts.browser.ts tests/integration/security.ts \
  .agents/skills/verify-kamoti/features/citizen-reporting.md .agents/skills/verify-kamoti/features/public-board.md
git commit
```
Message:
```
test: browser and security tests for the Phase 2 flows

Browser: split-name registration, main problem, cancel reason, and the
Google map; pins come from a faked device location inside Makati, so
the flows run without a Maps key. FUNC-02 drives request, verification,
and resolution itself. New accounts.browser.ts covers sign-up codes,
the residency lock and review, password reset, refresh, and idle
sign-out against Mailpit, and skips without it. Security: IMP-01 to
IMP-09 for the lock, the private proofs bucket, closed tables,
feedback rules, the public rejection reason, comments, and Makati
bounds. The verify-kamoti notes describe the Google map.
```

## Step 6. Commit this file
```bash
git add COMMITS_C7b_C8.md
git commit -m "docs: commit instructions for C7b and C8"
```

## Step 7. Push and confirm
```bash
git push origin improve/integration
git status --short                 # expect: nothing
```
It is a fast-forward, so no force is needed.

## Optional trailer
If you want it, end each message with this line, after a blank line:
```
Claude-Session: https://claude.ai/code/session_01F2YXueyCAknu3LPazw69pd
```
