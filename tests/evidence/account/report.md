# Account and registration evidence

## Board fixture integration correction

After integration with main through #84/#85, the focused mobile-marker case
failed before rendering. Vite reported that the simulated Maps module did not
export `APIProvider`, which AddressFields imports eagerly. The controlled
adapter now exports an inert provider that returns its children. Application
code, assertions, and failure checks are unchanged.

Before the correction, this command failed with one timeout after the missing
export error:

```text
bunx playwright test --config tests/evidence/website-board/playwright.config.mjs --grep 'mobile marker'
```

After the correction, both consumers of the simulated adapter passed:

```text
bunx playwright test --config tests/evidence/website-board/playwright.config.mjs --grep 'mobile marker|desktop marker'
  2 passed, 0 failed.
bun run typecheck:test
  Passed.
git diff --check
  Passed.
```

The isolated frontend used port 5413 and stopped after the run. No API server
was started on 4413. API responses and Maps were simulated. Generated
screenshots were discarded because this correction changes no visual behavior.
No shared database writes occurred. Existing mail-delivery limits remain open
in #91, and issues #82/#83 remain outside this correction. Owning application
documentation needs no change for this test-only export.

Baseline is merged PR #81, commit `98608291d629fe89d8205c40454cca659161f078`.
The isolated runtime used frontend `http://localhost:5411` and API
`http://localhost:4411`. The API used intentionally unavailable loopback Supabase
configuration. Its `/api/health` endpoint returned `{"status":"ok"}`.
No hosted database, fixture seeding, cleanup, or test email was used.

## Observed changes

- On PR #81, typing `0917123456789` retained all 13 digits. The same browser
  assertion failed with expected `09171234567`, received `0917123456789`.
  The changed shared field stops at 11 digits. Formatted and overlong paste
  produces a visible cleanup notice. Blank remains valid and a wrong prefix
  remains invalid. Registration, account editing, and administrator creation
  were exercised.
- The suffix field accepts typing and offers the existing six suggestions.
  `jr` submits `Jr.` and administrator input `iii` submits `III`.
  Unsupported `Esq.` is rejected. No suffix database constraint changed.
- Registration submits a numberless street successfully. House/unit number
  alone cannot satisfy the street requirement. Account editing preserves the
  entire legacy `Unit 4B, 12 J.P. Rizal Street` when only the phone changes.
  New numbers and streets join into the existing `address_line` payload.
- The existing PR #81 layout and red required markers remain. Create-account
  actions are centered. Registration and sign-in were checked at 320, 375,
  414, 768, and 1280 pixels with no horizontal page overflow or page errors.
- A simulated duplicate-account 409 can continue to code entry without another
  signup request. A simulated resend 503 remains visible and permits retry.
  A subsequent 204 starts the cooldown and uses conditional delivery wording.
  Simulated code acceptance routes an account without residency proof to the
  proof step. It does not grant residency approval.
- Before the auth fix, an already-open signed-out tab stayed signed out after a
  successful login in another tab. The browser regression failed because the
  second tab had no Sign out button. The storage listener now reloads its
  profile when it sees a new token. A late response cannot adopt a token that
  has since changed or disappeared.
- Four tabs share one serialized refresh, the rotated access token, idle
  activity, and logout. The idle check uses the existing visibility-change
  handler to wake background tabs after setting the shared test timestamp.
  This avoids relying on background-tab timer scheduling.
- Password recovery keeps its existing code/password flow. Its submit and
  return actions now use the same centered layout. Its shared resend message
  remains valid for recovery as well as signup.

## Checks

All final checks passed.

```text
bun run typecheck
  API, web, deployment, and test typechecks passed.

bun test tests/fast/account-fields.test.ts tests/fast/accounts-email.test.ts tests/fast/validation.test.ts tests/fast/account-edit.test.ts tests/fast/account-codes.test.ts
  110 passed, 0 failed, 298 assertions across 5 files.

bun run build
  API compilation and web production build passed.

bunx playwright test --config playwright.account.config.ts
  9 passed, 0 failed.

git diff --check
  Passed.
```

The full fast suite was not run, as requested. Existing required CI remains
unchanged. The focused browser configuration has no database teardown and
intercepts all API calls in authenticated scenarios. Public form checks use
the running frontend directly. Auth responses, code acceptance, resend
success/failure, and account saves in these scenarios are simulated.
Every final browser scenario asserts that its tabs emitted no page errors.
Fixture logins enter through the protected account route, so their redirect
stays within the account slice. An earlier incomplete dashboard fixture was
corrected before the final nine-scenario run.

## Visual evidence

- [PR #81 registration before](register-before-desktop.png).
- [Registration after, desktop](register-after-desktop.png).
- [Registration after, mobile](register-after-mobile.png).
- [Email continuation and cooldown, simulated](email-resume-simulated.png).

## Limits and documentation handoff

Real email delivery, OTP redemption, pending-account password preservation by
Supabase, and database persistence were not verified. Windows Docker and psql
were unavailable. The coordinator's WSL probe failed with
`Wsl/Service/CreateInstance/CreateVm/ERROR_TIMEOUT`. Existing focused server
tests prove handling of stubbed Supabase responses, including email throttles
and signup-only verification. No backend email defect was established, so the
delivery implementation and API contract were retained.

There is no Google Maps key in this runtime. The manual-entry fallback was
verified. With a configured key, suggestions use the existing APIProvider
loading options and the Places Autocomplete Data API, with the entered street,
selected barangay, Makati query context, Philippine region restriction, and
existing Makati bounds. They are search suggestions, not a complete or strictly
barangay-bounded street catalog. Live Google predictions and provider failure
behavior remain unverified. MapPicker and MapFrame were not changed.

API use was checked against Google's [Autocomplete Data reference](https://developers.google.com/maps/documentation/javascript/reference/autocomplete-data)
and [Place Autocomplete Data guide](https://developers.google.com/maps/documentation/javascript/place-autocomplete-data).

The coordinator owns documentation edits. Update `docs/FRONTEND.md` for the
typed constrained suffix, optional house/unit number, lossless address editing,
manual street fallback, explicit email continuation, and shared-tab login.
Review UA-5, UA-6, UA-7, UA-9, and UA-13 in
`docs/updates/IMPROVEMENT_REQUIREMENTS.md`. No role permission or accepted-risk
change is intended. Issues #82 and #83 remain outside this change.

Type System Discipline kept suffix submissions inside the existing database
values. Model the Domain kept address composition in one helper and code-entry
state in one value. A narrow comment review removed one redundant comment.
The unavailable cursor-team-kit deslop skill was replaced by direct inspection
of the actual diff within the user's approved scope.
