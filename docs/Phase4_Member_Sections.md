# Phase 4 member report sections

This page splits the [Phase 4 security and testing report](Phase4_Test_Report.md)
into five sections, one per member, for the Monday, 28 September 2026 report.
The test report still owns every case, result, and piece of evidence. This page
only says who owns which part and what they must show.

Replace `Member 1` to `Member 5` with names once the team agrees on the split.

## Baseline QA run

All suites were run on 26 September 2026 against commit `0d299e6` on `main`.
That day's browser run targeted the deployed test site
`https://kamoti-chi.vercel.app`, and the security suite ran against the approved
test project `chqyxlyrmudmkanqmpil`.

The screenshots the report cites are in `tests/evidence-deployed/`. They were
recaptured on 27 September against the deployed site, serving `main` at
`dcd08d3`, where all 33 browser tests passed. The
[evidence index](Phase4_Test_Report.md#evidence-index) lists every file and the
command that reproduces the set. The older `tests/evidence/` folder is not cited.

| Suite | Command | Result |
| :--- | :--- | :--- |
| Typecheck | `bun run typecheck` | Pass |
| Fast suite | `bun test` | 168 / 168 pass |
| Deployed smoke check | `bun run test:smoke` | 12 / 12 pass |
| Security integration | `bun run test:security -- --target chqyxlyrmudmkanqmpil` | 28 / 28 pass |
| Browser (Playwright) | `bun run test:browser` | 18 / 18 pass |

No new defects were found. The report's summary stands at 65 cases: 62 passed,
3 not run (the usability sessions `USE-S1` to `USE-S3`), 1 fixed (`BUG-01`),
and 3 remaining. The
[testing summary](Phase4_Test_Report.md#testing-summary) owns these figures.

Two setup notes for anyone re-running the suites:

- Run `bun install` after pulling. `@playwright/test` is in `bun.lock`, and a
  stale `node_modules` makes `bun run typecheck` fail in `tests/browser/`.
- The security suite asks for the fixture password. Set `FIXTURE_PASSWORD` or
  type it at the prompt. The value is in
  [the test environment guide](TEST_ENVIRONMENT.md#synthetic-test-fixture-data).

## Section assignments

| Member | Report sections | Case IDs | Cases |
| :--- | :--- | :--- | :--- |
| Member 1 | A. Input validation, B. SQL injection | `VAL-01`–`VAL-10`, `SQLI-01`–`SQLI-10` | 20 |
| Member 2 | C. Authentication | `AUTH-01`–`AUTH-11` | 11 |
| Member 3 | D. Authorization | `AUTHZ-01`–`AUTHZ-15` | 15 |
| Member 4 | E. Cross-site scripting, F. Functional | `XSS-01`–`XSS-04`, `FUNC-01`–`FUNC-12` | 16 |
| Member 5 | G. Usability, bug log, testing summary, peer evaluation | `USE-S1`–`USE-S3`, `BUG-01` | 3 sessions |

### Member 1: Input validation and SQL injection

- **Evidence:** `tests/fast/validation.test.ts`, `tests/fast/query-safety.test.ts`,
  and the `VAL-10` and `SQLI-06` to `SQLI-10` rows of the security run.
- **Present:** one rejected form with its field error message, and one
  injection payload from section B with the response it received.
- **Explain:** the four "How injection is prevented" points in section B.
- **Gap:** the handout asks for screenshots of invalid inputs. Section A has
  none yet; `FUNC-01b-coordinate-error.png` and `AUTH-09-empty-form.png` are the
  closest existing images.

### Member 2: Authentication

- **Evidence:** `tests/fast/auth.test.ts`, the `AUTH-04` to `AUTH-11` rows of
  the security run, and screenshots `AUTH-04` to `AUTH-11` in
  `tests/evidence-deployed/`.
- **Present:** valid login for each role, wrong password, unknown email, empty
  form, protected-page redirect, and logout.
- **Explain:** wrong password and unknown email return the same message, so an
  attacker cannot tell which accounts exist.

### Member 3: Authorization

- **Evidence:** `tests/fast/auth.test.ts`, `tests/fast/permissions.test.ts`, and
  the `AUTHZ-06` to `AUTHZ-15` rows of the security run.
- **Present:** a citizen denied another citizen's report, an unassigned staff
  member denied a report, and citizens and staff denied `/api/admin/users`.
- **Explain:** scopes come from the signed-in session (`req.user`), never from
  a query parameter.
- **Screenshot:** `FUNC-06-unassigned-staff-denied.png` shows an unassigned
  staff member refused, the behaviour `AUTHZ-09` tests through the API.
- **Gap:** the other `AUTHZ` cases have no screenshot.

### Member 4: Cross-site scripting and functional testing

- **Evidence:** the `XSS-01` to `XSS-04` rows of the security run,
  `tests/fast/functional.test.ts`, and screenshots `FUNC-01a` to `FUNC-12` in
  `tests/evidence-deployed/`.
- **Present:** the full citizen report lifecycle (create, edit while pending,
  cancel), staff remark and status advance, the public board, admin analytics,
  category management, and the three responsive viewports.
- **Explain:** the three "How input is kept as data" points in section E.
- **Gap:** `FUNC-11` has no screenshot. The `FUNC-03` screenshot shows only
  that the interface offers the next stage alone; the server-side rejection is
  proven by the fast suite. The `XSS` cases have no screenshot of a payload
  shown as plain text in the browser.

### Member 5: Usability, bug log, summary, and peer evaluation

- **Evidence:** the [usability testing protocol](Usability_Testing.md) and
  section G of the test report.
- **Present:** the three peer sessions, their task results, ratings, and
  findings; the bug log; the summary metrics; and the contribution table.
- **Blocker:** section G is still empty. The three sessions, `USE-S1` to
  `USE-S3`, must be run and recorded before Monday. This is the only Phase 4
  requirement with no results yet.
- **Also:** the peer evaluation table in the test report is still empty and
  needs each member's name, role, contributions, and rating.

## Before Monday

- [ ] Agree on names for Member 1 to Member 5.
- [ ] Run and record usability sessions `USE-S1` to `USE-S3`.
- [ ] Fill in the peer evaluation table.
- [ ] Decide whether to add screenshots for the gaps listed above.
