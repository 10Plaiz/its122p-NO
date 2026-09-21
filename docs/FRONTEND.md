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
| `/reports/:id` | Citizen, Staff, Administrator | Read a report and its history, subject to server authorization. Owning citizens can edit pending reports inline. |
| `/notifications` | Citizen, Staff, Administrator | Read and mark the signed-in user's notifications |
| `/staff/queue` | Staff | Search and filter reports assigned to the Staff member |
| `/staff/reports/:id` | Staff, Administrator | Work a report, add remarks, advance status, and upload repair evidence |
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

## Shared browser behavior

- `src/web/lib/auth.tsx` restores a stored session with `/auth/me`, clears an
  invalid session, and selects the role home after sign-in.
- Client validation mirrors server validation where immediate field feedback is
  useful. Server validation remains authoritative.
- API field errors appear beside the corresponding form controls. Page-level
  failures use an alert and preserve a usable route back when one exists.
- The public board stores filters and paging in the URL so filtered views are
  shareable and browser navigation restores them.
- The report form keeps reverse-geocoded addresses editable. Coordinates remain
  the report location when the third-party lookup is unavailable.
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
