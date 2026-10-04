# Board map-failure verification

Verified on 2026-10-04 in the UI worktree on `feat/integration-ui-ux`.

## Diagnosis

The configured UI server is `http://localhost:5174`, with `/api` forwarded to
port 4001. Another Vite process in this worktree uses the default configuration
on port 5175, forwarding `/api` to port 4000. The user's other worktree runs on
5173 with its API on 4000. Opening 5175 can therefore combine this frontend with
the other worktree's API. Both tested public-report endpoints returned 200.

Google rejects both tested local origins with `RefererNotAllowedMapError`.
The installed React Maps provider exposes an authentication-failure status,
but its loader does not wire Google's `gm_authFailure` callback to that status.
The existing fallback consequently did not activate for the rejected key.

A fresh board sometimes remained visible. Filtering and returning from the
entry page reproduced a blank board on both ports, with SDK errors reading
`get`. The user's reported `clientWidth` exception is another missing-map
container path in `FitToReports`.

`reload.js` and its port-5500 socket were absent from repository source and the
clean browser session. A browser or editor extension is a likely source of that
message. The particular request blocked by the user's client could not be
identified from the supplied log.

## Frontend correction

- Register Google's authentication-failure callback, notify all mounted map
  frames, and remember the failure while the SDK survives route changes.
- Show the existing map-unavailable panel for a rejected key.
- Keep a boundary around each map widget to contain SDK rendering and React
  cleanup failures. Keep the key-rejection explanation when that is the cause.
- Check for a DOM container before measuring or observing the report map.

The callback follows the official
[Google Maps authentication-error guidance](https://developers.google.com/maps/documentation/javascript/events#listen-for-authentication-errors).
The key must authorize the UI origin in its website restrictions, as described
in [Google's error reference](https://developers.google.com/maps/documentation/javascript/error-messages#referer-not-allowed-map-error).
Key settings, server configuration, API code, and account records were not changed.

## Evidence

- [Baseline filtering and remount](before-remount-5174.png) showed a blank board
  after SDK failure on the configured UI origin.
- [After the correction](after-5174.png) showed the report list and map fallback.
- [Final native check on 5174](final-native.json) waits for the visible board
  after filtering and reopening. It recorded the heading, 50 cards, one map
  fallback, and no uncaught page errors under Google's real key rejection.

Two focused browser regression tests passed. They cover Google's authentication
callback, blocked script loading, report visibility, filtering, reopening the
board, and the mobile Map/List labels. The authentication test failed before
the correction because its expected fallback was absent. An intermediate test
driver tried to click hidden radio inputs; the final driver clicks their
visible labels and verifies the checked state.

Run these public checks without database cleanup:

```powershell
bunx playwright test --config tests/evidence/board-map-failure-2026-10-04/playwright.config.mjs
```

Frontend and test TypeScript checks and the frontend production build passed.
Actual map tiles and pins remain unverified because Google refuses the local
origin. The user should open `http://localhost:5174/board` for this UI worktree
and reload after the key's website restrictions are corrected.
