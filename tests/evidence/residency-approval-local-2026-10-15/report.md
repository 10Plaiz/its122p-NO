# Issue #59: approval before new reports and report photos

Local Supabase stack (`http://127.0.0.1:54321`), all 22 migrations applied,
`bun run dev`, Chromium through Playwright. One new synthetic Citizen, deactivated
afterwards. Administrator decisions went through `PATCH /api/admin/users/:id/residency`.

| Step | Check | Result | Screenshot |
| :--- | :--- | :--- | :--- |
| Proof sent | Home greys "Report an issue" and says the proof is under review | Pass | `59-01-home-awaiting-review.png` |
| Waiting | `/report/new` shows the waiting panel, not the form; Check again says still awaiting review | Pass | `59-02-new-report-waiting.png` |
| Waiting | My account shows "Awaiting review" | Pass | `59-03-account-awaiting-review.png` |
| Rejected | The Citizen is sent to the proof step with the Administrator's reason | Pass | `59-04-rejected-with-reason.png` |
| Resubmitted | The Citizen returns to waiting, not to another upload | Pass | `59-05-resubmitted-waiting.png` |
| Approved | Check again opens the report form in the same session; the menu link is active | Pass | `59-06-approved-form.png` |
| Mobile 375 px | Waiting panel without horizontal scroll | Pass | `59-07-mobile-waiting.png` |
| Console | No errors other than the expected 403 responses | Pass | — |

API: `bun run test:security -- --target 127` gave 45 passed, 0 failed, including
IMP-17 (address change, rejection, re-upload of the same file, approval). With the
pre-#59 rule, IMP-17 fails: the refused report is created with 201.
