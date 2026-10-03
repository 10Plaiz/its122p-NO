# Commit instructions: Phase 2 C6 follow-up

Written 2026-10-03. Follow the steps in order. Nothing here has been committed or pushed for you.

This file sits next to `COMMITS.md` and does not replace it. `COMMITS.md` describes the C4 and C5 commits. You made that work, plus most of C6, as one commit: `b239258 Changes for s6`, which is on GitHub. This file covers only what is left after `b239258`.

## What is already on GitHub (`b239258`)
| Part | What it does |
| :--- | :--- |
| C4 rejected status | Staff ask, an admin verifies, and the reason shows to the citizen and on the board. Migrations `…000700` and `…000710`. |
| C5 comments and ratings | Citizen comments at any status (10 an hour), the rating form, the staff summary, and the averages. |
| C6 report columns (B6) | Optional columns: Problems, Assigned on, Days in stage, Reporter residency, Phone verified, Rating. The status cell shows Awaiting verification and Delayed. The date column is now "Closed". |
| C6 activity log (B9) | Readable action names; server-side filters for action, role, report reference, and date. The export uses the same filters. |
| C6 users (B5) | A "Specializations" button on staff rows; the save uses `PUT`; the old `PATCH` path is removed. |

Checked on `b239258` before this follow-up:

| Check | Result |
| :--- | :--- |
| typecheck | pass |
| bun test | 475 pass / 0 fail |
| build | pass, but the main chunk is about 503 kB and warns (KI-21, planned for C9) |
| Live API on local Supabase | 18 of 18 |

The live checks:
- The rating reaches the lists and the export.
- All four log filters work, and the export matches the screen.
- Bad filter values get a 400, and a citizen gets a 403 on the log.
- `PUT` saves specializations, and `PATCH` gives a 404.

## What is left to commit
| File | Change |
| :--- | :--- |
| `src/web/pages/AdminLogs.tsx` | A "Clear filters" button when nothing matches. The table caption is built without a string-replace trick. |
| `tests/fast/report-columns.test.ts` | New, with 18 tests (described in step 3). |
| `docs/Final_Project.md` | Admin features: readable, filterable, exportable activity log; column choice; staff specializations. |
| `docs/updates/IMPROVEMENT_REQUIREMENTS.md` | SW-1 partial (area routing is C7); SW-3, SW-6, TB-2, and TB-4 done locally. |
| `ISSUES.md`, `PHASE2_PLAN.md` | B5, B6, and B9 ticked; C6 recorded. |
| `COMMITS_C6.md` | This file. |

The 18 tests in `tests/fast/report-columns.test.ts` check:
- The table's delay rule matches the staff page's rule, in 7 cases.
- Each new column exports what its cell shows.
- The new columns are hidden until chosen.
- Log filters reject anything that is not a plain value.
- Each filter reaches the query.

Checks on the full working tree:

| Check | Result |
| :--- | :--- |
| typecheck | pass |
| bun test | 493 pass / 0 fail |
| build | pass, with the same 503 kB warning |

The delay test was also run against a deliberately wrong rule (`>=` instead of `>`) and caught it.

## Step 1. Check where you are
```bash
git branch --show-current          # expect: improve/integration
git log --oneline -1               # expect: b239258 Changes for s6
git status --short                 # expect the 7 files from the table above, nothing else
```
If `git status` lists anything else, stop and look at it before continuing.

## Step 2. Review the code change
```bash
git diff -- src/web/pages/AdminLogs.tsx
```
You should see two changes:
- A `clearFilters()` function, and a "Clear filters" button inside the "No entries match those filters" message.
- The table caption now reads `… matching entries` or `… entries in total`, without `.replace("  ", " ")`.

## Step 3. Run the checks yourself (optional but recommended)
```bash
bun run typecheck
bun test
bun run build
```
Expect 493 tests passing. The build prints the old 500 kB chunk warning and still succeeds.

## Step 4. Commit the activity-log fix
Use exact paths. Never `git add -A` or `git add .`, because `.claude/worktrees/` would be staged.
```bash
git add src/web/pages/AdminLogs.tsx
git commit
```
Message:
```
fix(web): clear activity-log filters in one step

When nothing matches, the empty message now has a "Clear filters"
button that resets action, role, report, and both dates. The table
caption is built directly instead of patching double spaces.
```
This commit changes only that page, so the 475 tests from `b239258` still apply.

## Step 5. Commit the tests
```bash
git add tests/fast/report-columns.test.ts
git commit
```
Message:
```
test(tables): cover report columns, delay parity, and log filters

18 tests: the table's delay rule matches delayState on the staff page
in 7 cases; each new column exports what its cell shows and starts
hidden; the "Closed" date covers resolved and rejected reports; log
filters reject non-plain values, join the actor strictly only for a
role filter, and reach the query in order.
```
After this commit, `bun test` shows 493 passing.

## Step 6. Commit the scope and notes
```bash
git add docs/Final_Project.md docs/updates/IMPROVEMENT_REQUIREMENTS.md ISSUES.md PHASE2_PLAN.md COMMITS_C6.md
git commit
```
Message:
```
docs(scope): report columns, activity-log filters, specializations

The proposal lists the readable, filterable activity log, column
choice on report tables, and staff specializations. SW-3, SW-6, TB-2,
and TB-4 are done locally; SW-1 is partial until area routing (C7).
ISSUES and the plan record B5, B6, and B9 as done.
```

## Step 7. Push and confirm
```bash
git push origin improve/integration
git status --short                 # expect: nothing
git log --oneline -4               # expect your three commits on top of b239258
```
It is a fast-forward, so no force is needed.

## Optional trailer
If you want it, end each message with this line, after a blank line:
```
Claude-Session: https://claude.ai/code/session_01F2YXueyCAknu3LPazw69pd
```

## Before deploying (unchanged from earlier notes)
- On the shared Supabase project, apply migrations `…000100` to `…000710` in order (KI-01). C6 adds no migration.
- The report list and export now join `report_feedback`, which needs `…000500`.
- The activity log reference filter reads `metadata->>reference_code`, which every report action already writes.
