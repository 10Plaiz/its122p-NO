# Commit instructions: Phase 2 C7 (area routing by barangay, SW-1)

Written 2026-10-04 on `improve/integration` at `e93a8a8`, which GitHub has. Follow the steps in order. Nothing has been committed or pushed for you. `COMMITS.md` and `COMMITS_C6.md` are earlier lists and stay as they are.

## What C7 does
| Who | What changes |
| :--- | :--- |
| Every report | The database works out its barangay from the pin, on create and whenever the pin moves. Existing reports are filled in by the migration. |
| Administrator | **Users → Routing** on a staff row shows the specializations (categories) and the new **areas** (barangays) side by side. |
| Administrator | **Assign** lists staff in four groups: handles the category *and* covers the barangay; category only; barangay only; everyone else. Each group is ordered by open work. The dialog subtitle names the barangay. |
| Admin and staff | A **Barangay** filter on All reports and My queue, and an optional Barangay column on all three report tables. Exports follow the filter. |
| Public | Board cards show the barangay, and the board has a **Barangay** filter that is kept in the URL. |
| Citizen and staff | The report pages show the barangay next to the category or filed date. |

Your decisions (2026-10-03): show the barangay on the board with a filter; add a filter and a column on the tables. The administrator still picks the person, because there is no auto-assignment.

### How the barangay is found
- **Boundaries:** OpenStreetMap's administrative relations for the 23 barangays, retrieved through Nominatim, ODbL. They are kept at full detail: 1,933 points, about 50 KB of SQL.
- **Coverage:** on a 50 m grid over the city, 7,484 of 7,486 points fall in exactly one barangay and none fall in two. The 2 left over are boundary slivers. A simplified copy was rejected because it made 6 gaps and 1 overlap.
- **Engine:** Postgres's built-in `polygon` type, with no PostGIS:
  - `polygon @> point` tests whether the pin is inside.
  - `polygon <-> point` gives the distance.
- **Rule:**
  - The barangay the pin is in.
  - On a sliver, the nearest barangay within about 500 m.
  - If none is that close (only old pins from before the Makati check), no barangay.

## Checks
Each commit was replayed in a throwaway worktree, and the replayed files matched this working tree:

| After | typecheck | bun test | build |
| :--- | :--- | :--- | :--- |
| Commit 1 (migration only) | pass | 493 pass / 0 fail | pass |
| Commit 2 (server) | pass | 502 pass / 0 fail | pass |
| Commit 3 (web, docs) | pass | 502 pass / 0 fail | pass |

At commit 3 the main chunk is about 513 kB and the build warns (KI-21, planned for C9).

### Local Supabase only, never the shared project
- The migration applies.
- Known places land in the right barangay:

  | Place | Barangay |
  | :--- | :--- |
  | City Hall | Poblacion |
  | Greenbelt | San Lorenzo |
  | Salcedo Village | Bel-Air |
  | Forbes Park | Forbes Park |
  | Guadalupe Nuevo | Guadalupe Nuevo |
  | Rockwell | Poblacion |
  | Dasmariñas Village | Dasmariñas |
  | Manila | none |

- The backfill filled every existing report, and moving a pin moves the barangay.
- 18 of 18 API and browser checks pass, with no console errors:
  - A new report at Greenbelt is in San Lorenzo, and editing its pin to City Hall moves it to Poblacion.
  - The table, board, and export filters work, and a barangay outside the list is a 400.
  - Areas save, including names with spaces, and a dropped area switches off.
  - Ranking marks the staff member who covers the area.
  - The Routing panel saves, the assign dialog groups by barangay, and the board filter works from the URL.

### New tests (`tests/fast/area-routing.test.ts`, 9 tests)
- The four-tier ranking and its tie-breaks.
- The area list rules. Pembo and Comembo are refused, since they are now in Taguig.
- The export's barangay filter.
- The migration's 23 names match the app's two lists exactly.
- No cascading deletes, and both new tables are closed to direct clients.

The ranking test was also run against wrong weights and caught them.

## Step 1. Check where you are
```bash
git branch --show-current          # expect: improve/integration
git log --oneline -1               # expect: e93a8a8 docs(scope): report columns, activity-log filters, specializations
git status --short                 # expect the 27 files listed in steps 3 to 5, nothing else
```

## Step 2. Run the checks yourself (optional but recommended)
```bash
bun run typecheck
bun test
bun run build
```
Expect 502 tests passing. The build prints the 500 kB chunk warning and still succeeds.

## Step 3. Commit the migration
Use exact paths. Never `git add -A` or `git add .`, because `.claude/worktrees/` would be staged.
```bash
git add supabase/migrations/20261003000800_area_routing.sql
git commit
```
Message:
```
feat(db): barangays, report barangay from the pin, staff areas

Seeds Makati's 23 barangays with their OpenStreetMap boundaries (full
detail, built-in polygon type, ODbL). barangay_at() returns the
barangay a point is in, or the nearest within about 500 m. A trigger
sets reports.barangay on insert and when the pin moves, and existing
reports are backfilled without touching updated_at. staff_areas
mirrors staff_specializations (rows switched off, never deleted).
public_reports gains barangay at the end of the view.
```

## Step 4. Commit the server side
```bash
git add src/server/routes/exports.routes.ts src/server/routes/public.routes.ts \
  src/server/routes/reports.routes.ts src/server/routes/staff.routes.ts \
  src/server/services/reports.common.ts src/web/lib/activity-labels.ts \
  tests/fast/area-routing.test.ts
git commit
```
`activity-labels.ts` is a web file, but it belongs here: a test requires a label for every action the server logs, and this commit adds `staff.areas_updated`.

Message:
```
feat(api): rank staff by category and barangay; barangay filters

GET/PUT /api/staff/:id/areas set the barangays a staff member covers.
GET /api/staff takes ?barangay= and orders staff who match both the
category and the barangay first, then category, then barangay, each by
open work. Report rows carry barangay; the report list, export, and
public board accept ?barangay=, checked against the 23 names.
```

## Step 5. Commit the web app, scope, and notes
```bash
git add src/web/components/AreaEditor.tsx src/web/components/BarangayFilter.tsx \
  src/web/components/AssignDialog.tsx src/web/components/BoardReportCard.tsx \
  src/web/components/data-table/report-columns.tsx src/web/lib/types.ts \
  src/web/pages/AdminReports.tsx src/web/pages/AdminUsers.tsx src/web/pages/Board.tsx \
  src/web/pages/MyReports.tsx src/web/pages/ReportDetail.tsx src/web/pages/StaffQueue.tsx \
  src/web/pages/StaffReport.tsx \
  docs/Final_Project.md docs/updates/IMPROVEMENT_REQUIREMENTS.md HANDOFF.md ISSUES.md PHASE2_PLAN.md \
  COMMITS_C7.md
git commit
```
Message:
```
feat(web): area routing screens and barangay on reports (SW-1)

Users > Routing shows a staff member's specializations and areas side
by side. The assign dialog groups staff by category and barangay match
and names the report's barangay. Report pages and board cards show the
barangay; the board, All reports, and My queue filter by it (the
board's filter is kept in the URL); report tables offer a Barangay
column. The proposal, requirements (SW-1 done locally), and notes are
updated.
```

## Step 6. Push and confirm
```bash
git push origin improve/integration
git status --short                 # expect: nothing
git log --oneline -4               # expect your three commits on top of e93a8a8
```
It is a fast-forward, so no force is needed.

## Optional trailer
If you want it, end each message with this line, after a blank line:
```
Claude-Session: https://claude.ai/code/session_01F2YXueyCAknu3LPazw69pd
```

## Before deploying
- Apply `…000800` on the shared Supabase project after `…000100` to `…000710` (KI-01). The code reads `reports.barangay`, `staff_areas`, and `public_reports.barangay`, so it must not be deployed before this migration.
- Run `bunx supabase db push --dry-run` against a local or disposable project first.
- The migration's backfill gives every existing report a barangay. A report pinned outside Makati before the Makati check gets none, and shows "—".
