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
| `/report/new` | Citizen | Submit a report through the location, details, and review steps |
| `/my-reports` | Citizen | Search, filter, open, or cancel the Citizen's reports |
| `/reports/:id` | Citizen, Staff, Administrator | Read a report and its history, subject to record-level server authorization (owning Citizen, assigned Staff, or Administrator). Owning citizens can edit pending reports inline. |
| `/notifications` | Citizen, Staff, Administrator | Read and mark the signed-in user's notifications |
| `/account` | Citizen | Update personal name, contact, barangay, and address details |
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

A Citizen with no uploaded proof, or with a rejected proof, must return to
`/register?step=proof` before using protected screens. Uploading proof unlocks
reporting while Administrator review is pending. Rejection locks it again.

### Report-detail return navigation

Protected report-detail views (`/reports/:id` and `/staff/reports/:id`) provide role-correct return navigation across both success and error states:
- Citizen returns to My reports (`/my-reports`).
- Staff returns to the Staff queue (`/staff/queue`).
- Administrator returns to Admin reports (`/admin/reports`).

When a user directly accesses a protected report-detail URL for a report they are not authorized to view, the server rejects the request with `403 Forbidden`. The interface renders the rejection alert without exposing protected report data or history, and the return button guides the user back to their role workspace.

## Shared browser behavior

- `src/web/lib/auth.tsx` restores a stored session with `/auth/me`, listens for
  the `kamoti:auth-expired` event dispatched on 401 or deactivation 403 API
  responses to clear local session state, and selects the role home after
  sign-in. Role or record ownership 403 responses preserve the session and
  display an on-screen alert.
- Registration starts with name parts, email, password, barangay, address, and
  privacy consent. It then asks for a six-digit email code. A correct code signs
  the Citizen in and opens the residency-proof step. Password recovery verifies
  a separate recovery code before changing the password and ending old sessions.
- The session can refresh a refused access token. After 15 minutes without
  activity, the interface warns the user and gives one minute to stay signed in.
  If the user remains idle, it signs out and saves an open report draft in this
  tab's session storage. A draft keeps text and the pin, but not an attached file.
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
- The report form keeps reverse-geocoded addresses editable. Coordinates remain
  the report location when the third-party lookup is unavailable.
- The report map supports pointer placement and a keyboard path: arrow keys move
  the map, then Place pin at map center selects its coordinates. Google Maps and
  Places provide the map and location search. The API also rejects pins outside
  Makati. If Places fails, the user can still select a pin on the map.
- Assignment dialogs move focus inside, contain Tab navigation, close with Escape,
  and return focus to the Assign control. Staff contact offers calling through
  `tel:` only.
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

## Change boundaries

Update this guide when a route, route-level role, page purpose, role home, or
important browser interaction changes. Update [API.md](API.md) instead when an
endpoint, payload, status code, or server permission changes. Current defects,
blockers, and implementation status belong in GitHub Issues; verification
evidence belongs in pull requests.
