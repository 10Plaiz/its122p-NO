# KAMOTI Improvement Requirements

Source: instructor review notes ([scattered_notes.md](scattered_notes.md)).
Scope: improvements to the current KAMOTI web application (Makati LGU infrastructure reporting).
Open work lives in GitHub Issues; each Partial row names its issue.
Later UI review notes are quoted verbatim in their implementing pull requests.

## Legends

| Priority | Meaning |
| :--- | :--- |
| High | Instructor-stated gap or scope correction. Address before final evaluation. |
| Medium | Strengthens security, auditability, or usability. |
| Low | Convenience or polish. |

| Status | Meaning (checked against `main` on 2026-10-15) |
| :--- | :--- |
| Done | On `main`; the code and its tests exist. |
| Done, verified hosted | Also checked on the shared project or the live site, as recorded in the closed issue named. |
| Partial | Part of it is done; the open issue for the rest is named. |
| Deferred | The owner postponed it; the reason is named. |
| Decision | Merged into another requirement. |

## 1. User Accounts and Roles

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| UA-1 | Define and document each user type (Citizen, Staff, Administrator) with its permissions. | High | Done: one Roles and permissions table in [API.md](../API.md#roles-and-permissions); other guides link to it. |
| UA-2 | Use "Citizen" as the public-user term in UI and documents, not "Customer". | Low | Done: the interface and documents say Citizen. |
| UA-3 | Let an Administrator activate and deactivate accounts. A deactivated account cannot sign in. | High | Done: `profiles.is_active`; a deactivated account gets 403 on every route, at sign-in, and at refresh (security IMP-14, local). |
| UA-4 | Strengthen password rules: at least 8 characters with a letter, a number, and a special character; show which rules are unmet. | High | Done, verified hosted (#50): 8 to 72 characters with lowercase, uppercase, digit, and punctuation; a live checklist shows unmet rules. |
| UA-5 | Verify email addresses with a 6-digit code entered in the app before the account becomes active. | High | Done, verified hosted (#50): six-digit signup code before the profile exists. |
| UA-6 | Verify mobile numbers with a one-time code through Supabase phone OTP and the Send SMS Hook. | Medium | Deferred (no SMS budget, owner 2026-10-03, reaffirmed 2026-10-15): the signed Send SMS Hook is dormant; Administrators confirm numbers, shown as "Confirmed by staff". |
| UA-7 | Collect extra confirmation details at registration: split name (first, middle, last, suffix), barangay, and full address. | Medium | Done: first, middle, last, and suffix; barangay; address; privacy consent. |
| UA-8 | Confirm that a registrant lives in Makati: barangay + address + one proof-of-residency upload reviewed by an Administrator. | High | Partial: barangay, address, private proof, and Administrator review bound to the version reviewed (#61). Approval before new reports and report photos is enforced by the API and shown in the browser (#59). Proof files are checked in full before storage (#62). Each approval records its basis: the document after four checks, or the no-document exception with a reason (#63). All five verified together on one revision, locally and on the hosted project (#64). An Administrator's name correction keeps the decision (#67). Replaced proofs and stored files no proof record points to are removed 30 days later (#70). Open: real-address accounts on the test project (#74). |
| UA-9 | Add session timeout: idle sign-out with a warning, and token refresh for active sessions. | High | Done: refresh through an HttpOnly cookie; idle warning at 15 minutes and sign-out a minute later. |
| UA-10 | Review other security features (rate limiting, lockout, secure session handling) and document the results. | Medium | Done: [SECURITY.md](../SECURITY.md) lists the controls, evidence, and accepted risks. Shared rate limits, the refresh cookie, and an enforced CSP were added on 2026-10-15 (security suite 44/44, local). |
| UA-11 | Show a clear reason when an action fails (sign-in, registration, submission) instead of a generic error. | Medium | Done: Supabase errors become plain messages with a next step; field errors sit beside their controls. |
| UA-12 | Let a person who forgot their password reset it with a 6-digit code sent to their email. | Medium | Done, verified hosted (#50): reset by emailed code; every old session ends. |
| UA-13 | Let a citizen update their own details (name, contact number, barangay, street) under the registration rules. | Medium | Done: My account and `PATCH /api/auth/me` with the registration rules. A Citizen's own name change returns to review and the form says so before saving; an Administrator's name correction keeps the decision (#67). |

## 2. Maps and Location

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| MP-1 | Replace Leaflet with Google Maps for report location picking and display. | High | Done, verified hosted (#51): Google Maps and Places on every map; Leaflet removed. |
| MP-2 | Restrict the map and all pins to Makati (current boundary, after the 2023 EMBO transfer). Pins outside Makati (the instructor's test pin was in Bataan) are rejected in the UI and on the server. | High | Done, verified hosted (#49): polygon check in the browser and API; the database box check is validated on the shared project. The larger picker now uses a fixed center pin and explicit confirmation after pan, search, or GPS (#85). Its new UI paths were checked with simulated Maps/API responses; live Google rendering was not rerun. |
| MP-3 | "Infrastructure" means the report category list. Merged into MP-2. | Medium | Decision. |
| MP-4 | Limit pinnable places to Makati, with place search restricted to Makati. Merged into MP-2. | Medium | Decision. |

## 3. Report Submission

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| RS-1 | Add voice-to-text for the report description (progressive enhancement where the browser supports it). | Low | Done: Dictate in English (Philippines) or Filipino where the browser supports speech recognition. Not tested with a real microphone. |
| RS-2 | Show only the problem types that apply to the selected category. | Medium | Done: the form lists only the chosen category's problem types. |
| RS-3 | Allow editing a submitted report, with the change recorded in its history. | Medium | Done for the owner while the report is pending; the history names the edited fields. |
| RS-4 | Record a primary (required) and a secondary (optional) problem type for each report. | Medium | Done: one required main problem and one optional other problem. |
| RS-5 | Keep a draft of the report form (text and pin) and warn before unsaved input is lost. | Medium | Done: the new-report form and the pending-report edit form keep a draft in this tab (not attached files) through a reload or an idle sign-out, and warn before losing input. An edit draft is dropped with a notice once the report leaves pending or changes (#69). |
| RS-6 | Let a citizen add a comment to their own report at any status; it appears in the report history and reaches the assigned staff member. | High | Done: the reporter comments at any status; the assigned Staff member and every Administrator are notified; 10 an hour. |
| RS-7 | Mark required report fields and acknowledge submission without claiming review has begun. | Medium | Done (#85): required fields have red asterisks; address, other problem, and photo stay optional. Submission shows a one-time awaiting-review message with title and reference while the report stays Pending. The focused browser scenarios passed with controlled API responses. |

## 4. Staff Workflow

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| SW-1 | Assign staff by specialization (category) and area (barangay). | High | Done: barangay from the pin; Staff categories and barangays; ranked assignment suggestions. |
| SW-2 | Require a comment with every status change, assignment, cancellation, and verification decision. | High | Done: status changes, assignments, cancellations, closure requests, and closure reviews all require a comment or reason. |
| SW-3 | Capture each activity on a report (who, what, when) in an activity log. | High | Done: every workflow action is logged with readable labels, server filters, and export. |
| SW-4 | Staff request resolution; an Administrator approves or returns it before the report is closed. | High | Done: Staff request closure; a different Administrator approves or returns it in one transaction. |
| SW-5 | Show resolved reports in green, with a text label or icon as well. | Low | Done: green with a check on badges and map pins. |
| SW-6 | Track status delays and show the relevant dates (submitted, assigned, completed). | Medium | Done: Key dates, a Delayed tag, Assigned on, and Days in stage. |
| SW-7 | Staff can reject a report that cannot be fixed, with a required reason, through admin verification (new `rejected` status). | High | Done: requested by Staff, approved by an Administrator, reason shown on the public board. |

## 5. Data Management

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| DM-1 | Never delete records from the database. Use soft deletion or deactivation flags. | High | Done: every foreign key restricts deletes; accounts are deactivated, not deleted. |
| DM-2 | After 90 days, remove the stored image files of cancelled reports. The photo rows stay with a `purged_at` date. | Medium | Done: an Administrator checks, then removes expired photo files from the dashboard; rows keep `purged_at`. No automatic schedule. |

## 6. Tables, Search, and Export

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| TB-1 | Add Google-style numbered pagination with a jump-to-page control. | Medium | Done: numbered pages with a jump-to-page box. |
| TB-2 | Let users hide and show columns, including a completion-date column. | Medium | Done: column choice per table, kept in the browser; a Closed date column. |
| TB-3 | Place filter and search at the top right of the table. | Low | Done: search sits at the right edge of each table toolbar, after filters. |
| TB-4 | Export table data to PDF and CSV, respecting the current filters and visible columns. | Medium | Done: CSV and PDF with the screen's filters and visible columns, up to 5,000 rows. |
| TB-5 | Refresh citizen, staff, and administrator report tables and choose newest or oldest order. | Medium | Done (#88): Refresh reloads rows and filter counts while retaining filters, sort, and page. Staff keeps its oldest default; other report tables keep newest, and Admin retains status sort. Focused controlled-response browser cases passed for all three roles, including loading, errors, retries, paging, CSV order, and mobile layout. |

## 7. Feedback

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| FB-1 | Let the citizen rate and comment on a resolved report, and route that feedback to the assigned staff member. | Medium | Done: one rating per resolved report, shown to the assigned Staff member; averages on the queue and dashboard. |

## 8. Public board

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| PB-1 | Explain public map symbols and provide a larger responsive map. | Medium | Done (#84): written status-pin legend using the existing palette, larger map, and a current-results-page scope explanation. Checked in Chromium with simulated Maps and API responses; live Google rendering was not rerun. |
| PB-2 | Reveal the public report selected through its map marker. | Medium | Done (#84): desktop selection expands, focuses, and scrolls to the matching card. Phones open a bottom report panel with Close, Escape, and focus restoration. |
| PB-3 | Let visitors enlarge public report photos. | Medium | Done (#84): every public photo opens in the existing lightbox; keyboard and backdrop dismissal, focus restoration, missing images, and retry were exercised. |
| PB-4 | Refresh the public board while retaining its selected view. | Medium | Done (#84): reports, totals, and filter counts reload without changing URL filters, sort, or page. Existing newest/oldest sorting remains. Focused error, empty, and paging scenarios passed with controlled API responses. |

## Implementation Notes

- Respect the stack in the [README](../../README.md) (React + Vite, Express, Supabase). Google Maps replaces Leaflet only as the map library.
- Items that change the database need Supabase migrations per the [API guide](../API.md#database-migrations): UA-5..8, MP-2, RS-4, SW-1, SW-4, SW-6, SW-7, DM-1, DM-2, FB-1.
- Items that change the UI follow the project's web-engineering standards: labels, inline errors, focus states, keyboard support, and `aria-live` for status messages.
- Compare each item against the [proposal](../Final_Project.md) before building. Report any mismatch rather than resolving it silently.
- External services: custom SMTP (UA-5) and a Google Maps key (MP-1) are available. No SMS provider yet: phone OTP runs on Supabase test codes until the team connects a Philippine SMS gateway through the Send SMS Hook.

## Decisions

| Ref | Note | Decision |
| :--- | :--- | :--- |
| UA-2 | "Customers" | Citizens. |
| UA-7 | "Name" | Keep the name format rule and split the name into first, middle, last, and suffix. `profiles.name` stays as the composed display name. |
| UA-8 | "Confirm if user is from Makati" | Barangay, address, and a proof-of-residency upload reviewed by an Administrator. The account works at once; its reports show "Unverified resident" until approved. Requires a Data Privacy Act consent checkbox. |
| UA-11, SW-7 | "Comments on why things didn't work" | Both: clear error messages (UA-11) and a required reason when staff reject a report (SW-7). |
| MP-1 | "Leaflet to gmaps" | Firm requirement. |
| MP-3, MP-4 | "Considered as infrastructure or limited places" | Merged into MP-2. |
| RS-2, RS-4 | "Hide attributes", "primary and secondary problems" | Problem types seeded per category; the form shows only the selected category's types. |
| SW-4 | "Someone to double check" | An Administrator verifies. |
| FB-1 | "Feedback back to the staff" | Citizen ratings reach the assigned staff member. |
| DM-1, DM-2 | "No deletion" vs "retention period" | Rows are never deleted; only files are removed: cancelled-report images after 90 days, and residency proofs 30 days after they stop being current (#70). |
| UA-9, RS-5 | "Session timeout and from the forms" | Idle sign-out with a warning; the report form keeps a draft. |
| UA-8 | "Prove residency before signing in" (2026-10-03) | The proof is uploaded signed in, right after the email code: before that nothing proves whose account a file belongs to. Until a proof is sent, or after a rejection, the citizen is locked to the upload step (strict: menu greyed, server refuses citizen routes), new and existing citizens alike. Sending a proof unlocks the account; reports show "Unverified resident" until an Administrator accepts it. Steps live in `/register?step=proof` (no new route). |
| UA-6 | "No budget for SMS" (2026-10-03) | Phone code is not required and has no citizen screen. Hook and provider slot stay as dormant plumbing; Administrators can mark a number verified. |
| UA-5, UA-12 | Re-registering an unconfirmed address keeps the first password (Supabase behaviour) | Add a password reset by emailed code. Registration never bypasses the code, even if the Supabase project has confirmations off. |
| TB-1 | "Go to table like google" | Numbered pages with jump-to-page. |
| SW-1 | "Staff for each specialization or area" (2026-10-03) | Area routing is required. The server derives a report's barangay from its pin; Administrators set each staff member's barangays; the assign dialog lists staff matching both category and barangay first. The Administrator still chooses (no auto-assignment). |
| RS-6 | "Comments required" (2026-10-03) | Citizens can comment on their own reports at any status, including resolved, rejected, and cancelled. Not on other people's reports. |
| FB-1, SW-7 | Rating a rejected report (2026-10-03) | Ratings stay for resolved reports only; comments (RS-6) cover every other status. A rejected report shows a "Closed" date (`verified_at`); `resolved_at` stays empty. |
| UA-13 | Citizen self-edit (2026-10-03, rules 2026-10-04) | In scope, on a new My account page. A changed barangay or street goes back to review and the account stays usable; an account verified without any uploaded proof is asked for one before it opens again. A changed number loses its verified mark; the activity log keeps the old and new number for administrators. |
| SW-7 | Rejected reports on the board; when staff can reject (2026-10-03) | Rejected reports stay on the public board with the approved reason; other closure reasons stay private. Staff can request rejection from under review or in progress, without a proof photo. |
| RS-6 | Who hears about a comment; spam (2026-10-03) | A citizen's comment notifies the assigned staff member and every active administrator. Ten comments an hour per citizen (per account, not per network); staff and admin remarks are not limited. |
| SW-1 | Barangay on the board; filters (2026-10-03) | Each report's barangay is shown on the public board, which can be filtered by it; All reports and the staff queue get a Barangay filter and an optional column, and exports follow the filter. |
| UA-4 | Password policy (owner, 2026-10-04) | 8 to 72 characters with lowercase, uppercase, digit, and punctuation: stronger than the original letters-and-digits wording. Leaked-password checking stays off on the free plan. |
| UA-8 | Approval before reporting (owner, 2026-10-05) | A Citizen files new reports and report photos only after an Administrator approves their residency. Replaces the 2026-10-03 rule that uploading proof unlocks reporting. Built in #59. |
| UA-10 | Citizen submission quotas (owner, 2026-10-05) | Trial limits per hour: 5 reports, 15 report photos, 3 proofs per account; ten times that per network. Changing them needs a migration. |
| UA-6 | SMS, again (owner, 2026-10-15) | Still no SMS budget. Administrators confirm numbers; My account shows "Confirmed by staff". |
| UA-10 | Security review follow-ups (owner, 2026-10-15) | Fixed: refresh token in an HttpOnly cookie, shared rate limits, code requests that no longer reveal accounts, an enforced CSP, and byte checks on report photos. Sign-in also stops after 20 failures for one address from any client. Accepted: earlier rejection notes live in the audit log only (KI-17). |
| UA-8 | Review evidence (owner, 2026-10-15) | A document approval needs four checks: the name matches, the address is in Makati and matches the account, the document is readable, and it is an accepted type within its date rule. Accepted documents stay as listed on the upload screen. Approval without a document stays, as an explicit exception with a reason kept in the audit. Built in #63. |
| UA-13 | Name corrections (owner, 2026-10-15) | An Administrator's name-only correction keeps a verified decision, recorded as `residency_kept` in the audit. A Citizen's own name change still returns to review, because the approval checked the name on the document. Built in #67. |
| UA-8 | Proof retention (owner, 2026-10-15) | A residency proof file is kept 30 days after it stops being current: after a replacement, or after it was stored if no proof record points to it (an upload that never reached an account). Attaching stops at 29 days. An account's current proof is never removed, and every proof row stays with the removal recorded. Built in #70. |
