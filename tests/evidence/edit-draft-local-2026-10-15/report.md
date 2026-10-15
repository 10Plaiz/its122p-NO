# Issue #69: a draft for the report edit form

Local Supabase stack (`http://127.0.0.1:54321`), `bun run dev`, Chromium through
Playwright, signed in as `fixture-citizen-1`. Synthetic pending reports only,
withdrawn (cancelled) afterwards.

| Step | Check | Result | Screenshot |
| :--- | :--- | :--- | :--- |
| Edit title, description, main problem | Draft stored under `kamoti.draft.edit-report.<account>.<report>` | Pass | — |
| Reload | Report page offers the edits; Edit report hidden while the offer is open | Pass | `69-01-offer-after-reload.png` |
| Continue editing | Title, description, and main problem restored | Pass | `69-02-restored-after-reload.png` |
| Idle sign-out (activity set 17 minutes back) | Draft holds the last edit; signing in again returns to the report and offers it | Pass | `69-03-offer-after-idle-signout.png` |
| Continue editing after sign-in | Title and main problem restored | Pass | `69-04-restored-after-idle-signout.png` |
| Save | Draft cleared; the restored edit reached the server; no offer after reload | Pass | — |
| Cancel | Draft cleared; no offer after reload | Pass | — |
| Discard them | Draft cleared; Edit report shown again | Pass | — |
| Report moved to under review | "No longer pending" notice; draft cleared; no offer | Pass | `69-05-not-pending-notice.png` |
| Report changed after the draft | "Changed since they were made" notice; draft cleared | Pass | — |
| Mobile 375 px | Offer fits without horizontal scroll | Pass | `69-06-offer-mobile.png` |
| Console | No errors | Pass | — |

Total 22 checks, 22 passed.

The local stack has no Google Maps key, so the pin could not be moved in the
browser. A moved pin in the draft is covered by `tests/fast/submission.test.ts`
(SUB-08), together with the account and report keys, restore, and each way a
draft is dropped.
