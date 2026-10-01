# KAMOTI Improvement Requirements

Source: instructor review notes ([scattered_notes.md](scattered_notes.md)).
Scope: improvements to the current KAMOTI web application (Makati LGU infrastructure reporting).
Status of every item: **Proposed** (not yet scheduled or implemented).

## Priority Legend

| Level | Meaning |
| :--- | :--- |
| High | Instructor-stated gap or scope correction. Address before final evaluation. |
| Medium | Strengthens security, auditability, or usability. |
| Low | Convenience or polish. |

## 1. User Accounts and Roles

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| UA-1 | Define and document each user type (Citizen, Staff, Administrator) with its permissions. | High |
| UA-2 | Use "Citizen" as the public-user term in UI and documents, not "Customer" (see Open Items). | Low |
| UA-3 | Let an Administrator activate and deactivate accounts. A deactivated account cannot sign in. | High |
| UA-4 | Strengthen password rules: require special characters and show which rules are unmet. | High |
| UA-5 | Verify email addresses before an account becomes active. | High |
| UA-6 | Verify mobile numbers (for example by one-time code). | Medium |
| UA-7 | Collect extra confirmation details at registration, such as a full address. | Medium |
| UA-8 | Confirm that a registrant lives in Makati and reject or flag others. | High |
| UA-9 | Add session timeout, including for idle sessions and for long-open forms. | High |
| UA-10 | Review other security features (rate limiting, lockout, secure session handling) and document the results. | Medium |
| UA-11 | Show a clear reason when an action fails (sign-in, registration, submission) instead of a generic error. | Medium |

## 2. Maps and Location

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| MP-1 | Replace Leaflet with Google Maps for report location picking and display. | High |
| MP-2 | Restrict the map and all pins to Makati. Pins outside Makati (the instructor's test pin was in Bataan) must be rejected, in the UI and on the server. | High |
| MP-3 | Decide which places count as "infrastructure" and limit pinning to those places or categories. | Medium |
| MP-4 | Limit the places a citizen may pin, for example by snapping to known locations or validating against Makati boundaries. | Medium |

## 3. Report Submission

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| RS-1 | Add voice-to-text for the report description. | Low |
| RS-2 | Hide form attributes that do not apply to the selected category or type. | Medium |
| RS-3 | Allow editing a submitted report, with the change recorded in its history. | Medium |
| RS-4 | Record a primary and a secondary problem for each report. | Medium |
| RS-5 | Apply the session timeout from UA-9 to the report form, and warn before unsaved input is lost. | Medium |

## 4. Staff Workflow

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| SW-1 | Assign staff by specialization or area, so reports route to the right team. | High |
| SW-2 | Require a comment with every status change or action. | High |
| SW-3 | Capture each activity on a report (who, what, when) in an activity log. | High |
| SW-4 | Require an Administrator to verify (double-check) a resolution before the report is closed. | High |
| SW-5 | Show resolved reports in green. Do not rely on colour alone (add a text label or icon). | Low |
| SW-6 | Track status delays and show the relevant dates (submitted, assigned, completed). | Medium |

## 5. Data Management

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| DM-1 | Never delete records from the database. Use soft deletion or deactivation flags. | High |
| DM-2 | Define a retention period for images from cancelled reports, and purge or archive them when it ends. | Medium |

## 6. Tables, Search, and Export

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| TB-1 | Add Google-style numbered pagination with a jump-to-page control. | Medium |
| TB-2 | Let users hide columns and add more, including a completion-date column. | Medium |
| TB-3 | Place filter and search at the top right of the table. | Low |
| TB-4 | Export table data to PDF and CSV, respecting the current filters and visible columns. | Medium |

## 7. Feedback

| ID | Requirement | Priority |
| :--- | :--- | :--- |
| FB-1 | Let the citizen rate and comment on a resolved report, and route that feedback to the assigned staff member. | Medium |

## Implementation Notes

- Respect the stack in [README.md](README.md) (React + Vite, Express, Supabase). No stack change is implied.
- Items that change the database (UA-3, SW-3, DM-1, DM-2, RS-4, FB-1) need Supabase migrations per the [API guide](docs/API.md).
- Items that change the UI should follow the accessibility and form rules in the project's web-engineering standards: labels, inline errors, focus states, keyboard support, and `aria-live` for status messages.
- Compare each item against the [proposal](docs/Final_Project.md) before building. Report any mismatch rather than resolving it silently.

## Open Items

| Ref | Question | Assumption used above |
| :--- | :--- | :--- |
| UA-2 | The note says "Customers". The team standard is `citizen`. | Treated as Citizens. |
| Header | The note "Name" has no context. | Not captured. It may refer to a name field or a naming rule. |
| MP-3 | The note "considered as infrastructure or limited places" is unclear. | Read as: only infrastructure-type places should be pinnable. |
| SW-4 | "Someone to double check" was confirmed as an Administrator. | Administrator verifies. |
| FB-1 | "Feedback back to the staff" was confirmed as citizen ratings. | Citizen rates; staff receive it. |
| RS-4 | "Primary and secondary problems" has no definition. | Two problem fields per report. |
| UA-9 | "Session timeout and from the forms" is unclear. | Idle sessions and long-open forms. |
