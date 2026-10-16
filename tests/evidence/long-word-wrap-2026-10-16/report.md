# Long unbroken words wrap inside their box

Reported in the browser: a description with one very long word ran across the map
on the report page. Headings already wrapped (`overflow-wrap: anywhere` in
`ds.css`); paragraphs, addresses, and other typed text did not. On phones the
page grids have one implicit column, which grew to fit the widest word (1,277 px
at a 375 px viewport), so even a wrapping rule could not break it.

Fix, in `src/web/styles/ds.css`:
- `body { overflow-wrap: break-word; }`: a word breaks only when it would
  overflow its box. Normal text, tables, and flex rows wrap as before.
- `.grid > * { min-width: 0; }`: a grid item can no longer stretch its column past
  the screen. `ds.css` sits in the `components` layer, so a `min-w-*` utility
  on an item still wins.

Local Supabase stack, `bun run dev`, Chromium through Playwright. Synthetic
reports for `fixture-citizen-1` (one assigned to `fixture-staff-1`) with a
168-character word in the description, a 94-character word in the title, and a
126-character word in the address; withdrawn afterwards.

| Page | Widths | With both rules switched off | With the fix |
| :--- | :--- | :--- | :--- |
| Citizen report (`/reports/:id`) | 320, 375, 768, 1280 | Description overflows its box at every width | Every box holds its text; no horizontal page scroll; no console errors |
| Staff report (`/staff/reports/:id`) | 320, 375, 768, 1280 | Description overflows its box at every width | Every box holds its text; no horizontal page scroll; no console errors |

Total 32 checks, 32 passed. Screenshots: `wrap-01` to `wrap-04` (Citizen report
at 1280 and 375 px, before and after), `wrap-05` and `wrap-06` (Staff report at
320 px, before and after).

Regression: full browser suite (`--retries=0`) on the same stack: 62 passed,
4 skipped, 1 failed. The failure, "Invalid fields use readable red feedback while
hints remain readable", also fails without this change: since #81 the
registration label reads "Email *", so the test's exact name "Email" no longer
matches. Typecheck, fast tests (670), and build pass.
