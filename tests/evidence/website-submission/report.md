# Report submission and location evidence

Group B, based on `98608291d629fe89d8205c40454cca659161f078`.

The browser used the actual React pages at `http://localhost:5412`. Auth,
categories, report submission, detail and notification responses were controlled
Playwright fixtures. No database records or shared Supabase data were written.
The local environment has no Google Maps key. Screenshots therefore show the
real map-unavailable fallback. A separate simulated map adapter exercises the
actual picker's camera and Places event handlers without Google services.

## Before and after

- [Before, desktop](before-desktop-location.png): GPS immediately selected the
  location and enabled Continue. The map frame was 420 px tall on desktop and
  300 px on mobile. Required report inputs had no asterisks, and successful
  submission navigated without an acknowledgement.
- [After, desktop](after-desktop-location.png): GPS prepares a candidate, followed
  by Confirm location. The map frame is 560 px on desktop and 440 px on mobile.
  Location guidance covers road, sidewalk and roadside public infrastructure;
  categories and Makati polygon validation remain intact.
- [After, required inputs on mobile](after-mobile-required-fields.png): required
  fields have red asterisks, accessible required text and native required
  attributes. Address, other problem and photo remain optional.
- [After, successful submission on mobile](after-mobile-submitted.png): the
  existing toast survives navigation to report detail and includes the title and
  reference. Status remains Pending. Reloading does not replay the message.

## Focused verification

- `bun test tests/fast/submission-location.test.ts tests/fast/submission.test.ts tests/fast/makati.test.ts`: 64 passed. Covers both Field label branches, optional default, center rounding, report rules/drafts and Makati boundaries.
- `bun run typecheck:web`: passed.
- `bun run typecheck:test`: passed.
- `bun run build:web`: passed.
- `bun x playwright test --config tests/submission-location.config.ts`: 3 passed;
  the baseline-only case was skipped. Baseline was separately run against the
  original owned files: 1 passed. Application files were restored afterward.
- `git diff --check`: passed.

Browser cases cover GPS confirmation, outside-Makati rejection, optional fields,
one acknowledgement after successful submission, no refresh replay, saved edit
locations and save gating after location changes. The simulated map adapter
covers the unconfirmed default center, fixed center pin during keyboard panning,
search and GPS candidates, Places failure, re-centering an existing report and
reconfirmation after editing. Confirmation waits until map movement ends.
No uncaught page errors occurred. Horizontal page overflow checks passed at
320, 375, 414, 768 and 1280 px widths.

The focused config has no database teardown. Run it with a Vite dev server at
5412, or set `PLAYWRIGHT_BASE_URL`. Its simulated-map case replaces Vite dev
modules only inside that browser context. `SUBMISSION_BASELINE=1` is intended
only for a checkout of the original implementation.

## Limits and documentation handoff

Live Google map tiles, real Places suggestions, physical-device GPS and database
persistence were not verified. No disposable local database was available.
The existing server workflow already emits notifications on actual status
transitions. Notification badge/count logic, issue #83 and issue #82 are untouched.

Root owns documentation integration. Update `docs/FRONTEND.md` to describe
pan-then-confirm, GPS/search candidates, confirmed-only drafts and the one-time
awaiting-review acknowledgement. Update the improvement requirement statuses
for MP-2/MP-3 and RS-3/RS-4/RS-5 with these browser changes and verification limits.
There are no migration, API, permission or accepted-security-risk changes.
