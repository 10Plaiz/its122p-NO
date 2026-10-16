# Internal report tables

Group D, 2026-10-16. Browser responses were simulated. No database writes ran.

Before: none of the three tables offered Refresh. My reports used the API's
newest default, Staff fixed oldest order, and Admin already offered newest,
oldest, and status sorting. The baseline browser run passed three scenarios
against commit `9860829`. [Admin before](before-admin.png).

After: all three offer Refresh. My reports and Staff expose newest and oldest
sorting. Admin retains every existing choice. Refresh reloads the list and
filter counts while preserving filters, sorting, and the current page. Rows,
pagination, and exports cannot expose the previous list while it reloads.

The focused browser run passed all three roles. It exercised default status
and order, changed row order, updated counts, retained search and status,
disabled busy feedback, hidden stale rows, list failure and retry, count failure
and Retry counts, CSV downloads with the selected sort, Admin assignment dialog
opening, empty results, page 2 preservation on refresh, and page 1 on sort change.
It checked search last and no page overflow at 320, 375, 414, 768, and 1280px.
There were no uncaught page errors. Assignment mutations and PDF downloads were
not exercised. Existing fast export tests passed.

- [Citizen at 320px](after-citizen-320.png)
- [Staff at 320px](after-staff-320.png)
- [Admin at 320px](after-admin-320.png)

Commands and results:

```text
bun run typecheck:web                                                PASS
bun run typecheck:test                                               PASS
bun test tests/fast/export.test.ts tests/fast/report-columns.test.ts tests/fast/report-fields.test.ts
                                                                    53 pass, 0 fail
bun run build:web                                                   PASS
bunx playwright test --config tests/browser/report-tables.config.ts   3 pass, 0 fail
git diff --check                                                    PASS
```

Initial browser harness attempts failed on the sign-in labels' required marks
and the dedicated launcher's working directory. Both were corrected before the
final passing run. Full API builds, the full fast suite, hosted delivery, and
database integration were outside focused verification.

The dedicated browser config starts a strict frontend on 5414, with its proxy
pointing to 4414. All scenario API requests are intercepted. No API process or
environment file was needed. Playwright stopped its server; the earlier manual
frontend process 7204 and both worker preview tabs were also stopped. No other
worker's process or ports were touched.

The status option blocks and enum semantics are unchanged. Issue #82 can add
its derived Awaiting verification filter independently. Issue #83 notification
files were untouched. Current origin/main remained at `9860829` before delivery.

Proposed owning documentation updates for root:

- `docs/FRONTEND.md`: describe Refresh for these three report tables, retained
  filters and current page, newest/oldest controls, Staff's oldest default, and
  Admin's retained status sort. Mention Refresh and Retry counts recovery.
- `docs/updates/IMPROVEMENT_REQUIREMENTS.md`: update the applicable refresh and
  chronological-sort status after integrating this PR and the public Board PR.
  Do not mark #82 or #83 complete from this change.

No API, permission, security, schema, migration, or secret changes. Reverting
the implementation commit restores the previous controls without a data step.
