# Admin Users recovery

This evidence covers the requested `/admin/users` recovery against current
main. The browser used a controlled API fixture on ports 5417 and 4417. It did
not connect to Supabase, write accounts, send mail, or open residency proofs.

## Verified behavior

- The default view selects Citizen and Active, orders all matching accounts by
  newest date first, puts unknown dates last, and renders 20 rows per page.
- Search, role, residency, account status, date order, and page compose in the
  URL. Reload and Back restore them. Filter and order changes reset the page;
  Clear filters retains the chosen date order.
- Responsive cards render at 320, 375, and 414 px. The table stays contained at
  768 px, and long account values wrap without horizontal page overflow.
- The action menu stays within the viewport and does not increase row height.
  It offers the approved Citizen, Staff, and Administrator actions. Self role
  and activation restrictions remain unavailable.
- Details, role, activation, and residency dialogs use native focus handling.
  Pending updates block Escape, backdrop dismissal, and duplicate writes.
  Failed role, phone, and residency requests retain saved values and support a
  retry. The no-document residency request retained its review version and note.
- The current grouped suffix selector and 11-digit phone input remained intact
  in the New account form.

## Screenshots

- `users-desktop.png` shows the recovered table at 1280 px.
- `details-mobile.png` shows account details at 375 px.

## Commands

- `bunx playwright test --config tests/browser/admin-users-recovery.config.ts`
- `bunx playwright test --config tests/browser/admin-users-recovery.config.ts --grep 'role dialog|activation confirmation|responsive cards'`
- `bun test tests/fast/account-fields.test.ts tests/fast/account-edit.test.ts tests/fast/residency-review.test.ts`
- `bun run typecheck:web`
- `bun run typecheck:test`
- `bun run build:web`

All listed commands passed. The full database-backed and browser suites were
not run because this recovery used no disposable local database.
