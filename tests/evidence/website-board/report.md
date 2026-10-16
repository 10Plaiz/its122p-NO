# Public board verification

Verified on 2026-10-16 in the isolated `improve-public-board` worktree, frontend
5413 and controlled API 4413. All report data and photos are simulated. No
Supabase credentials, records, or writes were used.

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
