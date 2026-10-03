# Commits to make: Phase 2 C0 to C3

Written 2026-10-03 on `improve/integration` at `888e112`. Replaces the earlier lists, which were never committed. Nothing is committed or pushed. Review, then commit with the exact paths below. Never `git add -A` or `git add .`, because `.claude/worktrees/` would be staged.

Each commit was replayed in a throwaway worktree:

| After | typecheck | bun test | build |
| :--- | :--- | :--- | :--- |
| Commits 1 + 2 | pass | 450 pass / 0 fail | pass |
| Commit 3 | pass | 448 pass / 0 fail | pass, no 500 kB warning |

The replayed tree matched this working copy file for file. Commit 2 holds C1 and C2, plus the switch of the report pages to Google Maps: those changes share `ReportDetail.tsx`, `StaffReport.tsx`, and `NewReport.tsx`, so they cannot be split by file.

Local evidence (local Supabase in Docker, never the shared project):
- `bun run fixture -- --target 127` completes, and `reports_within_makati_bbox` validates.
- API: Bataan and Pembo pins 400, Ayala 201, moving the pin to Manila 400, title-only edit 200, and cancel stamps `status_changed_at`.
- Browser:
  - Pin checks: 7/7 with faked GPS.
  - Maps checks: 8/8 with your key. The board, report detail, and staff report show Google maps, and resolved pins are green with a check. There were no console errors.

## 1. Scope and docs
```bash
git add docs/updates/IMPROVEMENT_REQUIREMENTS.md docs/Final_Project.md docs/API.md docs/API_Documentation.md
git commit
```
```
docs(scope): new requirements, Makati-only pins, Google Maps

New requirements UA-13 (citizen updates own details) and RS-6 (citizen
comments on own reports at any status). SW-1 area routing is required:
ranked suggestions by barangay, admin still chooses. Ratings stay for
resolved reports; a rejected report shows a "Closed" date.
MP-1, MP-2, and SW-5 done locally. The proposal now names Google Maps
and says pins must be inside Makati City. The API docs point at
lib/maps.ts instead of the removed lib/leaflet.ts.
```

## 2. Report fields, Makati-only pins, report pages on Google Maps
```bash
git add src/server/routes/reports.submission.routes.ts src/server/services/reports.common.ts \
  src/server/services/reports.submission.ts src/server/services/reports.workflow.ts \
  src/web/components/MapPicker.tsx src/web/components/ui.tsx \
  src/web/lib/maps.ts src/web/lib/report-rules.ts src/web/lib/submission-types.ts src/web/lib/types.ts \
  src/web/pages/NewReport.tsx src/web/pages/ReportDetail.tsx src/web/pages/StaffReport.tsx \
  scripts/fixture/seed.ts scripts/fixture/reports.ts \
  tests/fast/report-fields.test.ts tests/fast/makati.test.ts tests/fast/functional.test.ts \
  tests/fast/validation.test.ts tests/integration/security.ts
git commit
```
```
feat(reports): workflow fields, Makati-only pins, Google report maps

C1: REPORT_FIELDS includes the workflow columns, both problem types,
and photos.purged_at, so lists need no second request. A purged photo
gets a null URL and the report pages say it was removed after the
90-day retention period (DM-2, B8). GET /api/reports/:id/problems is
removed. Cancelling stamps status_changed_at (SW-6).

C2 (MP-2, B2): createSchema and editSchema refuse a pin outside
Makati's boundary on latitude; an edit that leaves the pin alone is
not checked. The report forms keep Continue/Save disabled for a device
location or restored draft outside Makati, and say why even when the
map cannot load. Fixture, test, and security-test pins moved from
Manila to Makati; the fixture reports moved to scripts/fixture/reports.ts
so tests can check them. Fixes KI-04.

C3 (MP-1, B3): ReportDetail and StaffReport show the report on
LocationMap (Google) instead of Leaflet. Resolved pins use the success
green (SW-5).

Deploy note: report queries need migrations 000100, 000300, and 000400.
```

## 3. Remove Leaflet; resolved pins carry a check
```bash
git add package.json bun.lock src/web/main.tsx src/web/styles/app.css \
  src/web/components/AssignDialog.tsx src/web/components/LocationMap.tsx \
  src/web/components/ReportMap.tsx src/web/components/StatusPin.tsx tests/geocode.test.ts
git rm src/web/lib/leaflet.ts tests/leaflet.test.ts
git commit
```
```
refactor(web): remove Leaflet; status pins with a check when resolved

No page uses Leaflet any more: drop leaflet, react-leaflet,
@types/leaflet, lib/leaflet.ts, and its stylesheet. The address lookup
was already in lib/maps.ts; its tests move to tests/geocode.test.ts.
StatusPin is shared by the board and the report maps, and draws a check
on resolved pins so colour is not the only signal (SW-5). The single
report pin is larger so it stands out among Google's place icons. The
main bundle drops to about 492 kB, under the 500 kB warning.
```

## 4. Optional: the issue list for the team
Commit this only if your teammates should see it in the repository.
```bash
git add ISSUES.md
git commit
```
```
docs: list known issues and future work for contributors
```

## Trailer
If you want them, add these two lines at the end of each message, after a blank line:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01F2YXueyCAknu3LPazw69pd
```

## After committing
- `git status --short` should list only `HANDOFF.md`, `PHASE2_PLAN.md`, and `COMMITS.md` (plus `ISSUES.md` if you skipped commit 4).
- Never commit `.env`: it holds your Maps key. Git already ignores it.
