# Status pills, search toolbars, and Admin Users

Verified on 2026-10-04 in `D:/Documents/kamoti-ui-ux`, branch
`feat/integration-ui-ux`, against `http://localhost:5174` and its existing
API proxy to port 4001. This work changes frontend presentation and interactions,
tests, and documentation. Backend code, API contracts, database state, and
development-server configuration were not changed.

## Audit and resulting behavior

The source inventory used `rg` over frontend components and pages. Report lists
and detail views already shared `StatusBadge`; account, residency, phone, and
notification states had separate rectangular tags or plain text. The initial
Admin Users browser check exercised role filtering, self-account restrictions,
and invalid-email feedback. Its eight-column table had no search or empty state,
and deactivation sent its request immediately.

`StatusPill` now owns the common shape, spacing, typography, and semantic fills.
It is a noninteractive span with a capsule radius, no border, and no hover change.
Its default single-line height is 24 px. Report-specific `StatusBadge` and
`DelayBadge` compose it, and the following consumers use the same component:

| Consumer | Status presentation |
| --- | --- |
| Public board cards | Report state |
| Admin reports, My Reports, staff queue | Shared report-status column and delays |
| My Reports and staff mobile cards | Report state, including awaiting verification |
| Citizen report details and staff report details | Report state |
| Staff reporter information and optional admin report columns | Residency and phone verification |
| Admin Users | Active/deactivated, residency, phone verification |
| Residency review and My Account | Residency and phone verification where shown |
| Admin categories | Active/retired |
| Notifications and its navigation counter | Unread state |

Categories and roles remain rectangular metadata tags. The removed outlined
status-tag styles have no remaining frontend consumers. Red continues to identify
errors and destructive actions. Pending, cancelled, rejected, and deactivated
states use neutral pills; review uses blue, progress teal, success green, and
verification delays or incomplete verification amber.

All six search pages put search last in their toolbar or filter grid: public
board, admin reports, admin activity log, admin users, My Reports, and staff queue.
The shared `TableToolbar.search` slot owns this order. DOM and keyboard order
match the visual order; controls wrap on smaller screens.

Admin Users now consolidates identity and contact details into one column, uses
five columns on desktop, and stacks the same rows below 768 px. Search matches
name, email, and mobile; account status filters the loaded list. Role and residency
continue using the existing API filters. Selecting staff or administrator clears
and disables the citizen-only residency filter.

Loading hides outdated rows under changed filters. Failed loads offer Try again;
empty lists explain the result and offer Clear filters. The existing self-account
restrictions remain visible. Role cancellation resets the unsaved selection and
clears stale feedback.

Deactivation and reactivation open a centered native dialog with keyboard focus
contained inside. Escape, Cancel, and an outside click dismiss it while idle and
restore focus. Saving prevents dismissal and repeat submission. Failure keeps the
dialog and unchanged status visible; success provides feedback and reloads users.

New account is a form with Enter submission and an initially focused first-name
field. Sending disables its fields and cancellation. Failed requests preserve
input. Server field errors block submission until their own field changes;
editing another field keeps those errors visible. Closing the form restores focus
to New account.

## Verification

The scoped Playwright configuration has no database cleanup or global teardown.
It reads the documented local presentation credential at runtime. It signs in
through the real UI and does not store credentials in evidence.

- The full scoped run passed all 12 checks, including the existing three palette
  checks and nine checks for this work.
- After tightening server field-error handling, both affected form checks passed
  again. After visual review corrected dialog positioning and the board check's
  wait for the filtered response, both affected checks passed again.
- `bun run typecheck:web`, `bun run typecheck:test`, `bun run build:web`, and
  `git diff --check` passed.
- Public and Admin Users checks covered 320, 375, 414, 768, and 1280 px widths
  without horizontal page overflow. The activation dialog was also checked for
  horizontal and vertical centering at 320 px.
- Rendered pills met 4.5:1 text contrast and retained their appearance on hover.
  Search followed all filters in DOM order and remained rightmost on its row.
- Real flows covered filtering, clearing filters, self-account restrictions,
  role cancellation, validation, staff routing expansion, and staff queue layout.
- Controlled browser responses covered load failure and retry, empty API results,
  failed saves, activation confirmation, reactivation feedback, phone-verification
  failure, duplicate submission prevention, and server field errors.
- All nine new checks asserted no uncaught page errors. Expected failed-resource
  console messages from deliberately failed requests are not uncaught application
  errors.

Account mutations were intercepted in the browser. A synthetic inactive profile
was used only in the reactivation/phone edge-case check. These results prove UI
handling of those responses; they do not claim a persisted account change.
Google Maps requests were blocked in the new UI checks to avoid unnecessary use.
No additional map behavior was implemented in this follow-up.

Citizen-only My Reports, report details, and My Account were checked through
source and type checks. The documented citizen test account remained gated by
residency, so this follow-up does not claim live coverage of those protected pages.

Run the focused checks with:

```powershell
bunx playwright test --config tests/evidence/pills-users-toolbar-2026-10-04/playwright.config.mjs
```

## Screenshots

- [Public board with report pills and rightmost search](board-pills-desktop.png)
- [Admin Users on desktop](users-desktop.png)
- [Admin Users and routing on mobile](users-routing-mobile.png)
- [Failed deactivation on desktop](deactivation-failure.png)
- [Centered failed-deactivation dialog at 320 px](deactivation-failure-mobile.png)
- [Simulated phone-verification failure](simulated-phone-failure.png)
- [Staff report pills on mobile](staff-pills-mobile.png)

The public-board screenshot intentionally shows the map-load fallback because
these checks block Google Maps. Existing public reports and presentation accounts
were used for the ordinary read-only flows.
