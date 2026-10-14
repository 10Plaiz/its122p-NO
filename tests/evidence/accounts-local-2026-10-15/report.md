# Account and residency browser run, 15 October 2026

Issue: [#52](https://github.com/10Plaiz/its122p-NO/issues/52)

## Target

| Item | Value |
| :--- | :--- |
| Revision | `7b7d20e` plus the uncommitted #52 changes listed in `COMMITS_52.md` |
| Database | Local Supabase CLI 2.117.0 stack `kamoti`, all 21 migrations, rebuilt with `db reset --local` |
| Email | Local Mailpit on `127.0.0.1:54324` |
| App | `bun run dev` with `SUPABASE_URL=http://127.0.0.1:54321` |
| Data | Fixture accounts (`bun run fixture -- --target 127`) and demo seed `makati-demo-v1` (`--target local`) |
| Browser | Playwright 1.63.0, Chromium, `--retries=0` |
| Shared project | Not contacted. Cleanup retained all records |

## Results

| Command | Passed | Failed | Skipped |
| :--- | ---: | ---: | ---: |
| `bunx playwright test --retries=0` | 66 | 0 | 0 |
| `bun run test:browser:residency` | 17 | 0 | 0 |
| `bun run typecheck`, `bun run test` (581), `bun run build` | pass | 0 | 0 |

All 8 account tests ran with real Mailpit codes; none were skipped:

| Test | Screenshot |
| :--- | :--- |
| UA-5 sign-up: wrong code refused, right code accepted, used code refused (400) | `UA-5-code-confirmed-proof-step.png` |
| UA-8 locked until a proof is sent; 403 from the API | |
| UA-8 rejection with a reason; the Citizen sends a new proof | `UA-8-rejected-with-reason.png` |
| UA-8 approval: proof preview, "Accept as resident", notification, verified pill; a direct upload then returns 400 | `UA-8-approved.png` |
| UA-5 sign-in before confirming switches to the code step | |
| UA-12 reset: wrong code refused, right code changes the password, used code refused (400), old session ends | |
| UA-9 a refused access token is refreshed | |
| UA-9 idle warning, stay signed in, then idle sign-out | `UA-9-idle-warning.png` |

## Limits

- Local Mailpit proves the application flow and code handling, not hosted SMTP
  delivery. Hosted email was verified separately in the #50 checkpoint.
- Expired codes were not tested.
- Proof upload still unlocks reporting while review is pending. #59 changes
  that rule; `expectProofAccepted` in `tests/browser/helpers.ts` is the one
  place to update.
- The first baseline on the old local database had 17 failures, none from
  application defects:
  - storage uploads failing after an image update (fixed by `db reset --local`)
  - missing demo data
  - the residency review file running outside its own config
  - two tests written before the default Pending filter and the status pills
