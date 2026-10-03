# KAMOTI Improvement Requirements

Source: instructor review notes ([scattered_notes.md](scattered_notes.md)).
Scope: improvements to the current KAMOTI web application (Makati LGU infrastructure reporting).
Work plan and file ownership: [PARALLEL_PLAN.md](PARALLEL_PLAN.md).

## Legends

| Priority | Meaning |
| :--- | :--- |
| High | Instructor-stated gap or scope correction. Address before final evaluation. |
| Medium | Strengthens security, auditability, or usability. |
| Low | Convenience or polish. |

| Status | Meaning (checked against the code on 2026-10-02) |
| :--- | :--- |
| Existing | Already implemented; verify only. |
| Partial | Part of it exists; the remaining gap is named. |
| Gap | Not implemented. |

## 1. User Accounts and Roles

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| UA-1 | Define and document each user type (Citizen, Staff, Administrator) with its permissions. | High | Partial: roles exist; no single permissions document. |
| UA-2 | Use "Citizen" as the public-user term in UI and documents, not "Customer". | Low | Existing: verify only. |
| UA-3 | Let an Administrator activate and deactivate accounts. A deactivated account cannot sign in. | High | Existing: `profiles.is_active`, admin PATCH, `requireAuth` returns 403. Verify the sign-in message. |
| UA-4 | Strengthen password rules: at least 8 characters with a letter, a number, and a special character; show which rules are unmet. | High | Partial: length only (`validate.ts`). |
| UA-5 | Verify email addresses with a 6-digit code entered in the app before the account becomes active. | High | Gap: register uses `email_confirm: true`. |
| UA-6 | Verify mobile numbers with a one-time code through Supabase phone OTP and the Send SMS Hook. | Medium | Deferred (no SMS budget, 2026-10-03): the signed Send SMS Hook and a provider slot are built but dormant; an Administrator marks numbers verified. |
| UA-7 | Collect extra confirmation details at registration: split name (first, middle, last, suffix), barangay, and full address. | Medium | Partial: single name with a format rule. |
| UA-8 | Confirm that a registrant lives in Makati: barangay + address + one proof-of-residency upload reviewed by an Administrator. | High | Gap. |
| UA-9 | Add session timeout: idle sign-out with a warning, and token refresh for active sessions. | High | Gap: no refresh; no idle timeout. |
| UA-10 | Review other security features (rate limiting, lockout, secure session handling) and document the results. | Medium | Gap: no rate limiting in Express. |
| UA-11 | Show a clear reason when an action fails (sign-in, registration, submission) instead of a generic error. | Medium | Partial: field errors on some forms only. |
| UA-12 | Let a person who forgot their password reset it with a 6-digit code sent to their email. | Medium | Gap: added by the team on 2026-10-03 (see Decisions). |
| UA-13 | Let a citizen update their own details (name, contact number, barangay, street) under the registration rules. | Medium | Gap: added by the team on 2026-10-03 (see Decisions). Only an Administrator can change them today. |

## 2. Maps and Location

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| MP-1 | Replace Leaflet with Google Maps for report location picking and display. | High | Done locally (2026-10-03): board, pin picker, report detail, and staff report use Google Maps; Leaflet removed. Needs the key on the deployed site (KI-03). |
| MP-2 | Restrict the map and all pins to Makati (current boundary, after the 2023 EMBO transfer). Pins outside Makati (the instructor's test pin was in Bataan) are rejected in the UI and on the server. | High | Done locally (2026-10-03): map, report forms (device location and drafts included), API create and edit, and a database bounding-box check. The shared project still needs `validate constraint` after its pins are moved (KI-01). |
| MP-3 | "Infrastructure" means the report category list. Merged into MP-2. | Medium | Decision. |
| MP-4 | Limit pinnable places to Makati, with place search restricted to Makati. Merged into MP-2. | Medium | Decision. |

## 3. Report Submission

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| RS-1 | Add voice-to-text for the report description (progressive enhancement where the browser supports it). | Low | Gap. |
| RS-2 | Show only the problem types that apply to the selected category. | Medium | Gap. |
| RS-3 | Allow editing a submitted report, with the change recorded in its history. | Medium | Existing for the citizen while pending; history records field names only. |
| RS-4 | Record a primary (required) and a secondary (optional) problem type for each report. | Medium | Gap. |
| RS-5 | Keep a draft of the report form (text and pin) and warn before unsaved input is lost. | Medium | Gap. |
| RS-6 | Let a citizen add a comment to their own report at any status; it appears in the report history and reaches the assigned staff member. | High | Done locally (2026-10-03): `POST /api/reports/:id/remarks` accepts the owner at any status; history reads \"Comment from the reporter\"; notifies the assigned staff member and every administrator; 10 an hour per citizen. |

## 4. Staff Workflow

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| SW-1 | Assign staff by specialization (category) and area (barangay). | High | Partial (2026-10-03): administrators set each staff member's specializations on the Users screen, and the assign dialog lists specialists first. Area (barangay) routing is Phase 2 C7. |
| SW-2 | Require a comment with every status change, assignment, cancellation, and verification decision. | High | Partial: remarks require text; status and cancel do not. |
| SW-3 | Capture each activity on a report (who, what, when) in an activity log. | High | Done locally (2026-10-03): every workflow action is logged; the activity log shows readable labels and filters on the server by action, role, report reference, and date, and its export uses the same filters. |
| SW-4 | Staff request resolution; an Administrator approves or returns it before the report is closed. | High | Gap: staff set `resolved` directly. |
| SW-5 | Show resolved reports in green, with a text label or icon as well. | Low | Done locally: badges (green, check, word) and map pins (green, check). |
| SW-6 | Track status delays and show the relevant dates (submitted, assigned, completed). | Medium | Done locally (2026-10-03): Key dates and a Delayed tag on the staff page; report tables show Delayed in the status column and offer Assigned on and Days in stage columns. |
| SW-7 | Staff can reject a report that cannot be fixed, with a required reason, through admin verification (new `rejected` status). | High | Done locally (2026-10-03): migrations `…000700` and `…000710`; request from under review or in progress; admin approves or returns; the citizen and the public board see the reason. |

## 5. Data Management

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| DM-1 | Never delete records from the database. Use soft deletion or deactivation flags. | High | Partial: categories soft-delete; several foreign keys still cascade. |
| DM-2 | After 90 days, remove the stored image files of cancelled reports. The photo rows stay with a `purged_at` date. | Medium | Gap. |

## 6. Tables, Search, and Export

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| TB-1 | Add Google-style numbered pagination with a jump-to-page control. | Medium | Gap: Previous/Next only. |
| TB-2 | Let users hide and show columns, including a completion-date column. | Medium | Done locally (2026-10-03): column choice per table; "Closed" date (resolved or rejected); optional Problems, Assigned on, Days in stage, Reporter residency, Phone verified, and Rating columns. |
| TB-3 | Place filter and search at the top right of the table. | Low | Gap. |
| TB-4 | Export table data to PDF and CSV, respecting the current filters and visible columns. | Medium | Done locally (2026-10-03): report and activity-log exports use the screen's filters and visible columns. |

## 7. Feedback

| ID | Requirement | Priority | Status |
| :--- | :--- | :--- | :--- |
| FB-1 | Let the citizen rate and comment on a resolved report, and route that feedback to the assigned staff member. | Medium | Done locally (2026-10-03): rating form on the citizen's resolved report, the reporter's rating on the staff page, averages on the staff queue and admin dashboard. |

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
| DM-1, DM-2 | "No deletion" vs "retention period" | Rows are never deleted; only cancelled-report image files are purged. |
| UA-9, RS-5 | "Session timeout and from the forms" | Idle sign-out with a warning; the report form keeps a draft. |
| UA-8 | "Prove residency before signing in" (2026-10-03) | The proof is uploaded signed in, right after the email code: before that nothing proves whose account a file belongs to. Until a proof is sent, or after a rejection, the citizen is locked to the upload step (strict: menu greyed, server refuses citizen routes), new and existing citizens alike. Sending a proof unlocks the account; reports show "Unverified resident" until an Administrator accepts it. Steps live in `/register?step=proof` (no new route). |
| UA-6 | "No budget for SMS" (2026-10-03) | Phone code is not required and has no citizen screen. Hook and provider slot stay as dormant plumbing; Administrators can mark a number verified. |
| UA-5, UA-12 | Re-registering an unconfirmed address keeps the first password (Supabase behaviour) | Add a password reset by emailed code. Registration never bypasses the code, even if the Supabase project has confirmations off. |
| TB-1 | "Go to table like google" | Numbered pages with jump-to-page. |
| SW-1 | "Staff for each specialization or area" (2026-10-03) | Area routing is required. The server derives a report's barangay from its pin; Administrators set each staff member's barangays; the assign dialog lists staff matching both category and barangay first. The Administrator still chooses (no auto-assignment). |
| RS-6 | "Comments required" (2026-10-03) | Citizens can comment on their own reports at any status, including resolved, rejected, and cancelled. Not on other people's reports. |
| FB-1, SW-7 | Rating a rejected report (2026-10-03) | Ratings stay for resolved reports only; comments (RS-6) cover every other status. A rejected report shows a "Closed" date (`verified_at`); `resolved_at` stays empty. |
| UA-13 | Citizen self-edit (2026-10-03) | In scope. The rules for a changed number or address are settled when it is built. |
| SW-7 | Rejected reports on the board; when staff can reject (2026-10-03) | Rejected reports stay on the public board with the approved reason; other closure reasons stay private. Staff can request rejection from under review or in progress, without a proof photo. |
| RS-6 | Who hears about a comment; spam (2026-10-03) | A citizen's comment notifies the assigned staff member and every active administrator. Ten comments an hour per citizen (per account, not per network); staff and admin remarks are not limited. |
