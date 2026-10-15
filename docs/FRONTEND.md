# Frontend guide

This guide owns browser routes, route-level role access, page purposes, and
important interface behavior. Use [API.md](API.md) for endpoint contracts and
[ARCHITECTURE.md](ARCHITECTURE.md) for system boundaries.

## Route map

`src/web/routes.tsx` is the implementation source for this table.

| Route | Route-level access | Purpose |
| :--- | :--- | :--- |
| `/` | Public | Entry page and role-aware starting action |
| `/board` | Public | Searchable and filterable community report board |
| `/signin` | Public | Sign in, confirm an unconfirmed email, or start password recovery through `?step=reset` |
| `/register` | Public | Create a Citizen account, confirm its email code, then upload residency proof through `?step=proof` |
| `/report/new` | Citizen | Submit a report through the location, details, and review steps. A Citizen whose proof awaits review sees a waiting panel with a "Check again" button instead |
| `/my-reports` | Citizen | Search, filter, open, or cancel the Citizen's reports |
| `/reports/:id` | Citizen, Staff, Administrator | Read a report and its history, subject to record-level server authorization (owning Citizen, assigned Staff, or Administrator). Owning citizens can edit pending reports inline. |
| `/notifications` | Citizen, Staff, Administrator | Read and mark the signed-in user's notifications |
| `/account` | Citizen | Update personal name, contact, barangay, and address details. Before saving, a changed name or address says it goes back to review, or that a proof is needed when none is on file (#67) |
| `/staff/queue` | Staff | Search and filter reports assigned to the Staff member |
| `/staff/reports/:id` | Staff, Administrator | Work a report, add remarks, advance status, and upload repair evidence, subject to record-level server authorization (assigned Staff or Administrator) |
| `/admin` | Administrator | View system analytics |
| `/admin/reports` | Administrator | Search all reports and assign active Staff |
| `/admin/users` | Administrator | Create and maintain accounts |
| `/admin/categories` | Administrator | Create and maintain report categories |
| `/admin/logs` | Administrator | Review system-wide activity |

The route guard controls which screen React renders. It is not an authorization
boundary. The Express API authenticates every protected request and applies
record-level permission checks before returning data.

Registration marks required fields with a red `*` and sets their native `required`
attribute, including privacy consent. Middle name, suffix, and contact number
remain optional. The form shows validation errors after leaving a field and
keeps **Create account** disabled until all values are valid and consent is given.
On wider screens, the name fields use two rows of two columns. Email, contact
number, barangay, house/unit number, street/address, and password remain full
width, with password rules below the input. Mobile keeps the same field order
in one column. Consent and submission form the final group.
Suffix is typable with suggestions and canonicalizes to the six supported
values. House/unit number is optional; street/address is required. Google
street suggestions use the selected barangay as query context within Makati
bounds, and manual entry always remains available. The API still receives one
combined `address_line`. Existing combined addresses stay intact in the
street/address field rather than being split by guessing. Shared contact fields
cap typing and pasted digits at 11, retain the `09` rule, and explain when paste
formatting or excess digits were removed.

Sign-in and registration share `AuthPanel` for headings, field styling, and larger
red required markers. Sign-in uses a compact card centered in the space between
the header and footer, following the [shadcn login-01 layout](https://ui.shadcn.com/blocks/login).
The recovery link sits beside the password label, followed by a full-width submit
button and centered registration link. Its email confirmation and password
recovery screens use the same card. Registration keeps its wider form layout.
Both forms stack their full-width submit button above a centered link to the
other form. Only registration displays the required-fields explanation.
Sign-in stays enabled until a request is pending,
including when fields are empty, so browser autofill can still submit the form.

## Role navigation

| Role | Home after sign-in | Main workspace |
| :--- | :--- | :--- |
| Citizen | `/my-reports` | File and follow personal reports |
| Staff | `/staff/queue` | Process assigned reports |
| Administrator | `/admin` | Manage reports, users, categories, analytics, and logs |

All signed-in roles receive the notification link. The community board remains
available without an account. Navigation visibility is a presentation choice;
the server remains responsible for access control. What each role may do is
listed once, in [API.md](API.md#roles-and-permissions).

A Citizen with no uploaded proof, or with a rejected proof, must return to
`/register?step=proof` before using protected screens. Uploading proof unlocks
reporting while Administrator review is pending. Rejection locks it again.
The owner has approved keeping reporting closed until an Administrator
approves; #59 builds that change.

### Report-detail return navigation

Protected report-detail views (`/reports/:id` and `/staff/reports/:id`) provide role-correct return navigation across both success and error states:
- Citizen returns to My reports (`/my-reports`).
- Staff returns to the Staff queue (`/staff/queue`).
- Administrator returns to Admin reports (`/admin/reports`).

When a user directly accesses a protected report-detail URL for a report they are not authorized to view, the server rejects the request with `403 Forbidden`. The interface renders the rejection alert without exposing protected report data or history, and the return button guides the user back to their role workspace.

## Shared browser behavior

The [design system](../design.md) owns the shared visual contract. Routine
actions and selection use deep teal. Blue identifies information, green
identifies success, and amber identifies warnings. Red is reserved for errors
and destructive actions. Status badges and map pins use the same mapping.
The canonical tokens are in `src/web/styles/tokens.css`; reusable components
are in the components cascade layer in `src/web/styles/ds.css`.

- `src/web/lib/auth.tsx` restores a stored session with `/auth/me`, listens for
  the `kamoti:auth-expired` event dispatched on 401 or deactivation 403 API
  responses to clear local session state, and selects the role home after
  sign-in. Role or record ownership 403 responses preserve the session and
  display an on-screen alert.
- Registration starts with name parts, email, password, barangay, address, and
  privacy consent, with a line above the consent saying KAMOTI is a student
  project (#74). It then asks for a six-digit email code. A correct code signs
  the Citizen in and opens the residency-proof step. Password recovery verifies
  a separate recovery code before changing the password and ending old sessions.
- A returning registrant can continue email verification without repeating
  signup or sending a replacement password. Email confirmation and residency
  review remain separate. Resend feedback says a code was requested for an
  eligible account; it does not claim the mail arrived. Current delivery and
  code redemption need service-backed verification in #91.
- The session can refresh a refused access token. After 15 minutes without
  activity, the interface warns the user and gives one minute to stay signed in.
  If the user remains idle, it signs out and saves an open report draft, new or
  edit, in this tab's session storage. A draft keeps text and the pin, but not an
  attached file.
- Tabs share the login, refresh coordination, activity clock, and sign-out.
  An already-open signed-out tab adopts a new login after fetching the current
  profile and checking that the token is still current. Drafts remain per tab.
- Client validation mirrors server validation where immediate field feedback is
  useful. Server validation remains authoritative.
- An action button is disabled while its form is invalid or sending, and an
  edit form's Save is also disabled while nothing has changed. Each field states its requirement as a hint and shows its error once the user
  leaves it, marked with `aria-invalid` and linked by `aria-describedby`. Sign-in
  is the one exception: its submit stays enabled, because only the server can
  check a password and browser autofill can leave a disabled button stuck.
  `useLeftFields` in `src/web/components/ui.tsx` implements the rule.
- API field errors appear beside the corresponding form controls. Page-level
  failures use an alert and preserve a usable route back when one exists.
- The public board stores filters and paging in the URL so filtered views are
  shareable and browser navigation restores them. It opens at Under review;
  an explicit `status=all` preserves a chosen Any status view on reload.
- The public board has a larger responsive map and a written status-pin legend.
  Pins cover the current results page. Selecting one expands, focuses, and
  reveals its report in the desktop list. On phones it opens a bottom report
  panel over the map; Close or Escape returns focus to the marker. Refresh board
  reloads reports, headline totals, and filter counts while preserving the URL,
  filters, sort, and page. The list remains available when Maps cannot load.
- Admin Reports and My Reports open at Pending. The Staff queue opens at Under
  review. Any status remains selectable, and Clear filters shows every status
  rather than reinstating the initial selection.
- Dropdown filters include result counts, such as `Pending (12)`. Each option
  counts the rows that would match that choice and the other active filters.
  Search and activity-log dates restrict these counts too. Sort controls only
  reorder rows and do not have counts. Notification All/Unread filters already
  show counts for the loaded inbox.
- Report and activity counts use sequential pages from the existing read-only
  list endpoints. Only filter values stay in memory. Changing a dropdown or
  table page reuses those values; search/date changes refetch them after a
  short debounce. Report cancellation and assignment refresh the count data.
  Partial, duplicate, or changing page results are discarded. Loading and failed
  counts retain usable filters without presenting a missing count as zero;
  failed counting offers Retry counts separately from loading the list.
- Shared map frames listen to Google's `gm_authFailure` callback. A rejected key
  shows Map unavailable while preserving report lists, forms, and location
  details. The failed state survives route changes because the Maps SDK stays
  loaded. Correct the key's website restrictions and reload to retry the map.
- Report-map fitting checks that the map has a DOM container before measuring
  it. Script load failures also use the shared map fallback. A boundary around
  each map frame contains SDK errors during React rendering and cleanup so the
  rest of the page remains usable.
- The report form keeps reverse-geocoded addresses editable. Coordinates remain
  the report location when the third-party lookup is unavailable.
- The report picker keeps a pin at the map center. Panning, place search, and
  device location prepare a candidate; **Confirm location** selects it after the
  map stops moving. Moving the map clears confirmation in new reports and
  pending-report edits. Arrow keys provide the same pan-then-confirm path.
  The initial map center is unconfirmed. Google Maps and Places provide the map
  and search; without Places, panning still works. Without the map, device
  coordinates can still be confirmed. Both the picker and API reject pins
  outside Makati. Report categories include roadside public infrastructure;
  coordinates are not snapped to roads.
- Required report inputs have red asterisks and accessible required text.
  Address or landmark, the other problem, and photo remain optional. Successful
  submission shows one awaiting-review message with the title and reference
  while opening the Pending report. Reloading detail does not repeat it;
  Under review notifications belong to the actual workflow transition.
- Assignment dialogs move focus inside, contain Tab navigation, close with Escape,
  and return focus to the Assign control. Staff contact offers calling through
  `tel:` only.
- Report, account, residency, phone-verification, and unread-notification states
  share the noninteractive `StatusPill` component. Status pills use soft fills
  and a capsule shape; role and category tags retain square corners.
- List toolbars place search after filters and utility menus, at the right edge.
  This is also their keyboard order. Controls wrap to full width on phones.
- Admin Users groups account details into one column and stacks rows below
  768 px. Search, account status, role, residency, and their counts use the
  existing complete users response locally. Proof waiting for review counts
  only pending accounts with an uploaded proof. Selecting Staff or Administrator
  clears and disables residency; their role-option counts reflect that reset.
- The residency review dialog keeps one account snapshot. Proof access and
  decisions send its review version. A conflict keeps the dialog open and blocks
  decisions until **Refresh review** succeeds. Refresh loads the current address
  and version, then clears the previous proof preview and rejection reason.
  Only a successful decision shows a success message.
- The review offers three paths (#63). **Accept the document** stays disabled
  until the proof is open and all four checks are ticked: name, Makati address,
  readable, and accepted type within its date rule. **Approve without a
  document…** asks how the resident was confirmed; that reason goes to the
  activity log, not to the Citizen. **Reject…** asks for the reason the Citizen
  reads. The upload screen tells the Citizen what the Administrator checks.
- An unsuccessful users request shows an alert with Try again. Empty results
  explain the active filters and offer Clear filters. Loading does not show
  outdated rows under newly selected filters.
- Deactivation and reactivation require confirmation. The native dialog contains
  keyboard focus, closes with Escape or Cancel, and restores focus on dismissal.
  While saving, it stays open and prevents dismissal and duplicate submission.
  A failed save retains the current account status and shows an error in the dialog.
- New account is a form that supports Enter to submit. Fields and cancellation
  are disabled while sending. Failed submission retains input; correcting a
  rejected field clears its feedback, while other field errors remain visible.
  Cancelling restores focus to New account.
- Citizens who own a pending report can edit details and pin location inline on
  `/reports/:id` before staff handling begins. Saving updates the record and
  refreshes the timeline.
- Assigned Staff upload repair proof and request closure instead of directly
  resolving a report. Administrators review the displayed request and approve
  or return it with a comment. Approval requires a different account from the
  requester. A stale request returns an error so the reviewer must load the
  current request before retrying.

The browser request wrapper, data hooks, endpoint behavior, and response shapes
belong to [API.md](API.md).

## Feature behavior

- **Voice input (RS-1).** The report wizard and the inline edit form offer
  Dictate beside the description, in English (Philippines) by default or
  Filipino. It uses the browser's Web Speech API, so the audio goes to the
  browser vendor's recognition service, never to KAMOTI. Where the browser has
  no speech recognition, such as Firefox, the control is not shown and typing is
  the whole feature. Dictated text is appended and trimmed to the field limit.
  Not verified with a real microphone in any recorded test.
- **Drafts (RS-5).** The new-report form keeps a draft per account in this tab
  (text and pin, not the photo), including through an idle sign-out. The inline
  edit form on a pending report keeps a draft per account and report (title,
  description, category, problems, address, and a moved pin), through a reload,
  an idle sign-out, or an in-app link. Back on the report, the Citizen can
  continue editing or discard the edits. Saving, Cancel, and Discard clear it. A
  draft is dropped with a short notice when the report is no longer pending or
  has changed since the draft was made. Both forms warn before the page unloads,
  and Cancel on the edit form asks first. In-app navigation is not blocked.
- **Problem types (RS-2, RS-4).** After a category is chosen, the form lists
  only that category's problem types: one main problem is required, one other
  is optional.
- **Assignment suggestions (SW-1).** The Assign dialog on All reports lists
  active Staff ranked by the server: those who handle the report's category and
  cover its barangay first, then category specialists, then those covering the
  barangay, each with their open workload. The Administrator still chooses, and
  the assignment needs a comment. Administrators cannot be assigned, so they
  approve closures rather than closing reports themselves.
- **Staff routing (SW-1).** On Users, a Staff row's Routing control opens the
  specialization and area editors. Saving replaces the whole set; removed
  categories or barangays are switched off, not deleted.
- **Tables and exports (TB-1 to TB-5).** Report and log tables show numbered
  pages with a jump-to-page box; the current page is not kept in the URL. Column
  menus remember each table's columns in this browser only. Export offers CSV or
  PDF of every matching row up to 5,000, with the screen's filters and visible
  columns, and says when rows were left out. PDFs replace characters the
  built-in font cannot print, such as arrows and emoji; CSV keeps them.
  My reports, Staff queue, and Admin reports offer Refresh for rows and filter
  counts while preserving filters, sort, and current page. My reports and Admin
  reports default to newest; Staff defaults to oldest. Each offers newest/oldest,
  and Admin retains its status sort. Changing order returns to page one, and
  exports use that order. Loading or failed lists hide old rows and pagination
  and disable exports; Refresh and Retry counts provide separate recovery paths.
- **Photos.** Report photos open full size in a lightbox that closes with
  Escape or a backdrop click and returns focus to the photo. A photo removed by
  the retention purge shows that it was removed after the retention period.
  Every public-board photo can also be enlarged. Closing a photo opened from
  the mobile report panel keeps that panel open. Missing public photos show a
  readable fallback and a retry control.
- **Proof retention (#70).** The dashboard's Proof retention panel checks, then
  after a confirmation removes, residency proof files 30 days after they stopped
  being current. It reports replaced proofs and stored files no proof record
  points to separately. After a failed run it drops the old count, says how many
  files went, and asks for a new check.
- **Photo retention (DM-2).** The Administrator dashboard's Photo retention
  panel first checks which cancelled reports' photos are past 90 days, then
  removes them only after a second confirmation, because files cannot be
  restored.
- **Password reset (UA-12).** `/signin?step=reset` asks for an email, answers
  the same whether or not an account exists, then takes the six-digit code and
  a new password checked against the live rules list. A spent code that
  Supabase refuses to pair with the password asks for a new code.
- **Phone numbers (UA-6).** Text-message codes are not used (no SMS budget). My
  account shows a number as Confirmed by staff or Not confirmed yet, and a
  changed number returns to Not confirmed yet.
- **Ratings (FB-1).** The reporting Citizen can rate a resolved report once.
  The rating reaches only the assigned Staff member; Staff and Administrators
  see it read-only and cannot rate.

## Components

Shared building blocks in `src/web/components/`. Pages are described by route
above.

| Component | Purpose | Used on |
| :--- | :--- | :--- |
| `AdminLayout` | Secondary navigation tabs for the Administrator screens | Administrator routes |
| `AreaEditor` | Barangays a Staff member covers (SW-1) | Users |
| `AssignDialog` | Ranked Staff choice and required comment for an assignment | All reports |
| `BarangayFilter` | One-barangay filter with result counts | Board, All reports, Staff queue |
| `BoardReportCard` | One expandable report on the public board | Board |
| `CancelDialog` | Withdraw a pending report with a required reason (SW-2) | My reports |
| `ContactNumberField` | Philippine mobile number field, same rule as the API | Register, My account, Users |
| `EmailCode` | Six-digit code entry and resend controls | Register, Sign in, `PasswordReset` |
| `FeedbackForm` | The reporter's one rating of a resolved report | Report detail |
| `FeedbackSummary` | A rating or Staff average, read-only | Dashboard, Staff queue, Staff report, `FeedbackForm` |
| `FilterOption` | A filter choice with its result count | Report and user list filters |
| `IdleTimeoutDialog` | Idle warning and sign-out (UA-9) | Every signed-in screen |
| `Layout` | Page shell, role-based navigation, and the footer's student-project notice (#74) | Every route |
| `LocationMap` | One report's pin, read-only | Report detail, Staff report |
| `MapFrame` | Loads Google Maps where needed and shows Map unavailable on failure | `LocationMap`, `MapPicker`, `ReportMap` |
| `MapPicker` | Pin placement inside Makati, with place search | New report, Report detail edit |
| `PasswordReset` | Forgotten-password steps (UA-12) | Sign in |
| `PasswordRules` | Live checklist of password rules (UA-4) | Register, Users, `PasswordReset` |
| `PhotoLightbox` | Full-size photo view | Report detail, Staff report |
| `PhotoPicker` | Photo selection with type and size checks | New report, Staff report, `ResidencyProofStep` |
| `PhotoRetention` | Check and remove expired photo files (DM-2) | Dashboard |
| `ProofRetention` | Check and remove expired residency proof files (#70) | Dashboard |
| `ReportMap` | Board map of report pins | Board |
| `ResidencyProofStep` | Proof upload and review state (UA-8); asks for a sample document, not a real one (#74) | Register, My account |
| `ResidencyReview` | Administrator proof review: version checks, the document checklist, and the no-document exception | Users |
| `SpecializationEditor` | Categories a Staff member handles (SW-1) | Users |
| `StatusPin` | Map pin in its status color | `LocationMap`, `ReportMap` |
| `Toast` | Success messages | App shell and forms that save |
| `VerificationPanel` | Approve or return a closure request (SW-4, SW-7) | Staff report |
| `VoiceInput` | Dictation for the description (RS-1) | New report, Report detail edit |
| `ui` | Shared fields, buttons, alerts, and status pills | Every screen |
| `data-table/` | `DataTable`, `TableToolbar`, `ColumnMenu`, `ExportMenu`, `NumberedPagination`, and the shared report columns | All reports, Staff queue, My reports, Users, Activity log |

## Change boundaries

Update this guide when a route, route-level role, page purpose, role home, or
important browser interaction changes. Update [API.md](API.md) instead when an
endpoint, payload, status code, or server permission changes. Current defects,
blockers, and implementation status belong in GitHub Issues; verification
evidence belongs in pull requests.
