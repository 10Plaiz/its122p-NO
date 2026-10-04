# Commits to make: Phase 2 C4 + C5

Written 2026-10-03 on `improve/integration` at `2070fc2`, which GitHub has. Replaces the C4-only list, which was not committed. Nothing is committed or pushed. Never `git add -A` or `git add .`, because `.claude/worktrees/` would be staged.

C4 (rejected status) and C5 (feedback on pages, citizen comments) share seven files, including `ReportDetail.tsx`, `StaffReport.tsx`, `types.ts`, and `reports.workflow.ts`, so their code is one commit.

| State | typecheck | bun test | build |
| :--- | :--- | :--- | :--- |
| After commit 1 (SQL only, code as at `2070fc2`) | pass | 448 pass / 0 fail | pass |
| After commit 2 (this working tree) | pass | 475 pass / 0 fail | pass; main chunk 503 kB warns again (KI-21, planned for C9) |

Local evidence:
- C4: 22/22 end-to-end checks on local Supabase, listed in PHASE2_PLAN.md.
- C5: route tests run the real route in an app with a stand-in database. On local Supabase, 21/21 checks pass:
  - The citizen rates 4 and comments.
  - The admin is notified of a comment on an unassigned report, and another citizen gets 403.
  - The staff page shows the rating and the comment, staff are notified, and "Your rating" and "Citizen rating" both show 4 out of 5.
  - "Awaiting verification" shows while a request waits.
  - No console errors.

## 1. Database (C4)
```bash
git add supabase/migrations/20261003000700_rejected_status.sql supabase/migrations/20261003000710_public_rejection_reason.sql
git commit
```
```
feat(db): rejected report status and public rejection reason

20261003000700 adds 'rejected' to report_status. 20261003000710 adds
public_reports.rejection_reason, filled only for rejected reports, so
the board can say why while other closure reasons stay private. Two
files because Postgres cannot use a new enum value in the transaction
that adds it.
```

## 2. Rejected status, feedback on the pages, citizen comments (C4 + C5)
```bash
git add src/server/lib/rate-limit.ts src/server/routes/reports.workflow.routes.ts \
  src/server/services/reports.common.ts src/server/services/reports.workflow.ts \
  src/web/components/BoardReportCard.tsx src/web/components/StatusPin.tsx \
  src/web/components/VerificationPanel.tsx src/web/components/ui.tsx \
  src/web/lib/activity-labels.ts src/web/lib/maps.ts src/web/lib/types.ts \
  src/web/pages/AdminDashboard.tsx src/web/pages/Board.tsx src/web/pages/ReportDetail.tsx \
  src/web/pages/StaffQueue.tsx src/web/pages/StaffReport.tsx \
  tests/fast/comments.test.ts tests/fast/functional.test.ts tests/fast/workflow.test.ts
git commit
```
```
feat(reports): rejected status, citizen comments, feedback on pages

SW-7: the assigned staff member asks for a report under review or in
progress to be closed as rejected, with a required reason and no proof
photo; an administrator approves or returns it. Approval sets status
'rejected' (resolved_at empty) and tells the citizen why. The board,
filters, counts, badge, and pin include it; the dashboard's Open count
now sums the open statuses. Work cannot start while a request waits.

RS-6: the reporting citizen comments on their own report at any status
through POST /:id/remarks. The comment reaches the assigned staff member
and every active administrator, shows as "Comment from the reporter",
and is limited to 10 an hour per citizen account.

FB-1 (B4): rating form on the citizen's resolved report, the reporter's
rating on the staff page, and averages on the staff queue and admin
dashboard. The citizen page's history uses readable labels and shows
"Awaiting verification" while a request waits.
```

## 3. Scope and notes
```bash
git add docs/Final_Project.md docs/updates/IMPROVEMENT_REQUIREMENTS.md HANDOFF.md ISSUES.md PHASE2_PLAN.md COMMITS.md
git commit
```
```
docs(scope): rejected reports, citizen comments, and ratings

The proposal adds the Rejected outcome, citizen comments at any status,
and ratings for citizens, staff, and administrators. SW-7, RS-6, and
FB-1 are done locally, with their decisions recorded.
```

## Before deploying
- Apply `…000700` and then `…000710` on the shared project (KI-01), after the earlier six.
