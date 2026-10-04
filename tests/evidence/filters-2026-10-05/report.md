# Filter defaults and result counts

Verified on `http://localhost:5174` with its existing API proxy to port 4001.
Changes are limited to frontend components, pages, tests, and their documentation.
Backend handlers, API contracts, database files, and server configuration are unchanged.

## Result

| Page | Initial status | Counted filters |
| :--- | :--- | :--- |
| Admin Reports | Pending | Status, category, barangay |
| My Reports | Pending | Status |
| Staff queue | Under review | Status, barangay |
| Public board | Under review | Status, category, barangay |
| Admin Users | Existing unrestricted account view | Role, residency, account status |
| Activity log | Existing unrestricted activity view | Action, actor role |
| Notifications | Existing All view | Existing All and Unread counts retained |

Public reports do not expose Pending. Under review for the public board and Staff
queue follows the user's selected preference. Any status remains an explicit
choice. Clear filters shows all statuses. On the public board, `status=all`
preserves that choice across reloads and shared links.

Each dropdown option shows the number of results that would match that choice
and the other active filters. Search and activity dates apply to these counts.
The current dropdown's selection does not restrict its alternative options.
Sort controls have no counts because they reorder the same result set.

Counts cover all pages through sequential existing GET requests. The initial
read-only inspection found 117 public reports, 168 administrator-visible reports,
321 log entries, and 62 users. No partial page count is presented as a total.
Only filter values remain in memory; dropdown and page changes reuse them.
New search/date queries debounce and cancel the old count request. Missing counts
keep their plain labels with loading or Retry counts feedback. A zero is shown
only after a complete successful count.

Admin Users reuses its existing users response for local role, residency, status,
and search filtering. Proof waiting for review excludes pending profiles without
an uploaded proof. Staff and Administrator role counts reflect the accompanying
residency reset. No backend account mutation was needed for this change.

## Verification

Passed:

- `bun run typecheck:web`
- `bun run typecheck:test`
- `bun run build:web`
- `git diff --check`
- Seven scenarios in `tests/browser/filters.browser.ts` using the scoped config
  in this folder. Native select counts were compared to existing API `total`
  values for public, administrator, and staff reports and activity logs.
- Two existing account regressions: account creation blocks duplicate submission
  and dismissal while sending; load failures offer retry and distinguish empty
  filtered and unfiltered responses. The empty-response test now reloads the page
  because account filter changes reuse the loaded response.

The seven new browser scenarios cover combined filters, all result pages,
explicit Any status reloads, clearing filters, case-insensitive account search,
proof presence, zero results, date/reference restrictions, a failed later count
page, changing totals, duplicate IDs, retries, and cancellation of obsolete
search requests. Every scenario checks for uncaught page errors. Viewports at
320, 375, 414, and 768 pixels passed checks for horizontal page overflow.

The account count test uses four explicitly simulated profiles after authentic
administrator sign-in. The count-failure test uses controlled count-only pages
while the visible public list remains live. The stale-search test delays a
controlled old count response. Those controlled cases do not create, update, or
delete database records. Google Maps script requests were blocked in the browser
suite to avoid unnecessary map use. The scoped config has no shared-fixture
cleanup or global teardown.

## Evidence

- [Public board default](board-default-desktop.png) shows Under review and counts at 1280 pixels.
- [Admin Reports default](admin-reports-default-desktop.png) shows Pending and counts at 1280 pixels.
- [Count failure](count-failure-board.png) shows retry feedback with the live public list preserved.

The public and administrator screenshots were visually inspected for readable
selected counts and layout. Existing notifications already display All and
Unread counts for their loaded inbox; source inspection confirmed both use the
same returned notification set.

## Verification limit

No documented demo citizen account has verified residency in this API. The live
My Reports route therefore remains unavailable for the citizen browser check.
Its Pending initialization, count binding, clear-filter behavior, and count reload
after cancellation were reviewed in source and type-checked. The shared report
counter was exercised against live administrator and staff access without
bypassing citizen permissions. No residency or account state was changed.
