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
| `/signin` | Public | Sign in and return to the requested page or role home |
| `/register` | Public | Create a Citizen account |
| `/report/new` | Citizen | Submit a report through the location, details, and review steps |
| `/my-reports` | Citizen | Search, filter, open, or cancel the Citizen's reports |
| `/reports/:id` | Citizen, Staff, Administrator | Read a report and its history, subject to record-level server authorization (owning Citizen, assigned Staff, or Administrator). Owning citizens can edit pending reports inline. |
| `/notifications` | Citizen, Staff, Administrator | Read and mark the signed-in user's notifications |
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

## Role navigation

| Role | Home after sign-in | Main workspace |
| :--- | :--- | :--- |
| Citizen | `/my-reports` | File and follow personal reports |
| Staff | `/staff/queue` | Process assigned reports |
| Administrator | `/admin` | Manage reports, users, categories, analytics, and logs |

All signed-in roles receive the notification link. The community board remains
available without an account. Navigation visibility is a presentation choice;
the server remains responsible for access control.

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
- Successful citizen registration navigates to `/signin` with registration
  state, pre-filling the submitted email and displaying an account creation
  confirmation banner.
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
  shareable and browser navigation restores them.
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
- The report map supports pointer placement and a keyboard path: arrow keys move
  the map, then Place pin at map center selects its coordinates.
- Assignment dialogs move focus inside, contain Tab navigation, close with Escape,
  and return focus to the Assign control. Staff contact offers calling through
  `tel:` only.
- Report, account, residency, phone-verification, and unread-notification states
  share the noninteractive `StatusPill` component. Status pills use soft fills
  and a capsule shape; role and category tags retain square corners.
- List toolbars place search after filters and utility menus, at the right edge.
  This is also their keyboard order. Controls wrap to full width on phones.
- Admin Users groups account details into one column and stacks rows below
  768 px. Name, email, mobile, and account-status filtering runs over the loaded
  user list; role and residency use the existing server filters. Selecting Staff
  or Administrator clears and disables the citizen-only residency filter.
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

The browser request wrapper, data hooks, endpoint behavior, and response shapes
belong to [API.md](API.md).

## Change boundaries

Update this guide when a route, route-level role, page purpose, role home, or
important browser interaction changes. Update [API.md](API.md) instead when an
endpoint, payload, status code, or server permission changes. Current defects,
blockers, and implementation status belong in GitHub Issues; verification
evidence belongs in pull requests.
