# Public board verification

Verified on 2026-10-16 in the isolated `improve-public-board` worktree, frontend
5413. The original run reused a manually started frontend. The corrective run
below starts its own frontend and runs no API process. All report data and
photos are simulated. No Supabase credentials, records, or writes were used.

## Before and after

- Before: the desktop map was 560px tall; photos were plain thumbnails; selecting
  a marker expanded a card without scrolling or moving focus. There was no board
  refresh control. Newest, oldest, and status sorting already existed.
- After: the desktop map is 680px tall and gets more horizontal space. The mobile
  map uses 65dvh with a 400px minimum. The written legend reuses existing status
  pins and explains that pins cover the current results page.
- Refresh reloads visible reports, headline totals, and filter counts without
  changing the URL, filters, sort, or page. Existing newest/oldest/status sorting
  and the initial Under review filter remain.
- Marker selection expands and focuses the desktop card and scrolls its list.
  Mobile selection brings the map into view and opens a bottom panel with a
  visible Close report button. Escape and Close return focus to the marker.
- Every public photo opens through PhotoLightbox. Enter, Escape, backdrop close,
  focus restoration, and keeping Tab inside the photo view were exercised.
  Missing images show a readable fallback and Retry photo.

## Evidence

- `before-desktop.png`: T3 preview baseline, 1280x800, 12 simulated reports.
- `after-desktop.png`: actual map-unavailable path, 1280x900, 55 simulated reports.
- `after-photo.png`: full-resolution photo modal and focused close control.
- `after-mobile-panel.png`: 375x812 panel, sticky Close report, and visible map.

Screenshots intentionally differ in fixture size. The baseline proves the old
layout, while after images exercise paging and offscreen selection.

## Checks

- `bun test tests/fast/board-card.test.ts tests/fast/query-safety.test.ts`:
  47 passed, 0 failed. Public card rendering, all public photos, approved rejection
  reason, legend labels, and existing sort/query allowlists.
- `bunx playwright test --config tests/evidence/website-board/playwright.config.mjs`:
  4 passed, 0 failed. Filters, oldest ordering, refresh and updated totals/counts,
  error/empty recovery, 50+5 paging, desktop reveal/focus, photo keyboard/backdrop
  dismissal, missing photo, mobile panel/close/focus, and map fallback.
- Browser overflow checks passed at 320, 375, 414, 768, and 1280px.
- `bun run typecheck:web`: passed.
- `bun run typecheck:test`: passed.
- `bun run build:web`: passed.
- `git diff --check`: passed.

The initial browser run exposed a simulated Maps module missing an export.
After correcting that adapter, a real mobile focus-restoration failure exposed
focus capture happening after the board became inert. Capturing the marker
before opening the panel fixed it. The passing browser suite exercises that path.

## Limits and handoff

### Cold-start correction

Root ran the committed command at `ffcd0cfed6349839ced80abc71c80b0357c12de3`
without a prestarted server and received:

```text
Error: Timed out waiting 60000ms from config.webServer.
```

The corrective owner independently reproduced that same failure before editing.
Playwright launched Vite from the config directory, `tests/evidence/website-board`,
rather than the repository root. The earlier passing run reused a manually
started frontend and did not prove cold-start reproducibility.

The board-only Playwright config now sets `webServer.cwd` to the repository root,
uses strict port 5413, and refuses existing-server reuse. Its board-only Vite
config inherits the application configuration but overrides `/api` to
`http://localhost:4413`. Resolving that config confirmed the application root is
`src/web` and the only API proxy target is 4413. Root `vite.config.ts` is unchanged.
Every one of the four tests installs `**/api/**` interception before navigation.
No API process was started. No request can fall through to an unrelated service
on port 4000.

The browser uses Playwright's installed Chromium by default. An optional
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects another executable. Install the
default browser with `bunx playwright install chromium` when needed.

Both 5413 and 4413 had no listeners immediately before this exact command:

```text
bunx playwright test --config tests/evidence/website-board/playwright.config.mjs

Running 4 tests using 1 worker

  ok 1 tests\browser\board-improvements.browser.ts:49:1 › board sort, filters, refresh, count updates, error and empty recovery (3.4s)
  ok 2 tests\browser\board-improvements.browser.ts:84:1 › desktop marker reveals its card, photos support keyboard and missing images (3.4s)
  ok 3 tests\browser\board-improvements.browser.ts:111:1 › mobile marker opens a closable panel, keeps map context and restores focus (3.0s)
  ok 4 tests\browser\board-improvements.browser.ts:137:1 › missing Maps key retains list, photos, larger map and filters (3.2s)

  4 passed (17.3s)
```

The command exited 0 without a browser executable override. The omitted startup
messages were Node warnings that `FORCE_COLOR` overrides `NO_COLOR`.
Playwright stopped its frontend after the run. Neither reserved port had a
listener afterward. The existing screenshots are retained from the original
run because this correction changes only verification configuration.

Corrective checks also passed with `bun run typecheck:web`,
`node --check tests/evidence/website-board/playwright.config.mjs`,
`node --check tests/evidence/website-board/vite.config.mjs`, and
`git diff --check`. The fast-test and production-build results above belong to
the original implementation round, not this configuration-only correction.

### Remaining limits

The browser spec replaces API responses and the external Maps adapter. Actual
ReportMap callbacks, Board, cards, panels, lightbox, and focus behavior run in the
browser. Google Maps tiles, SDK keyboard behavior, camera fitting, hosted API
responses, and database privacy enforcement were not proven live. The real
missing-key fallback was exercised without replacing MapFrame.

PublicReport has no closure-request fields. The legend describes the public
statuses it can actually show; it does not invent an Awaiting verification state
or expose internal closure notes. Issue #82 remains separate. Shared primitives,
styles, database schema, permissions, and the other workers' files are unchanged.

The coordinator owns documentation updates. Update docs/FRONTEND.md's board and
photo behavior, the public-board verification feature recipe, and the relevant
approved website-improvement Status entries to cite this evidence. Keep existing
SW-5/SW-7 semantics and the API privacy contract.
