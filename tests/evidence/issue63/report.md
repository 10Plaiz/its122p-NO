# Residency review evidence and exceptions, 15 October 2026

Issue: [#63](https://github.com/10Plaiz/its122p-NO/issues/63)

## Owner decisions

- A document approval needs four checks: the name matches, the address is in
  Makati and matches the account, the document is readable, and it is an
  accepted type within its date rule.
- Accepted documents stay as listed on the upload screen.
- Approval without a document stays, as an explicit exception with a reason that
  is kept in the audit and never shown to the Citizen.

## Target

| Item | Value |
| :--- | :--- |
| Revision | `feat/63-review-evidence`, rebased on `2fa08ae` (#59 and #62 merged) |
| Database | Local Supabase CLI 2.117.0 stack `kamoti`, all 23 migrations, marked `kamoti.test_database = 'disposable'`, holding the fixture and demo seed |
| Shared project | Not contacted |

## Results

| Check | Command | Result |
| :--- | :--- | :--- |
| Review SQL | `psql ... -f tests/database/residency-review.sql` | 24/24 on the seeded stack and on a fresh replay; includes an audit failure for each approval method |
| Native replay | Every migration into a fresh `kamoti_test_63` database, as in [LOCAL_DEV.md](../../../docs/LOCAL_DEV.md#residency-version-checks) | `api_access`, `atomic-actions` 28, `residency-reviews` 70, `residency-review` 24, `submission-limits` 41, `proof-retry-admission` 34, `auth-rate-limits` 18, and all 8 concurrency cases pass |
| Fast suite | `bun run test` | 651 pass, including `tests/fast/residency-review.test.ts` and a Citizen self-approval refused with `403` |
| Security suite | `bun run test:security -- --target 127` | 45/45; IMP-12 now proves an approval with no basis gets `400` and the audit records `method` and `checks`; IMP-17 (#59) sends the document basis |
| Account browser suite | `npx playwright test tests/browser/accounts.browser.ts` on the local stack | 8/8; the Administrator ticks the four checks before Accept the document, and the Citizen waits for approval (#59) |
| Review browser suite | `bun run test:browser:residency` (simulated API) | 18/18 with `--retries=0`. One earlier run had a single intermittent console-error failure in the mobile conflict test; it passed alone and on every later run, and its message was not captured |
| Full browser suite | `npx playwright test --retries=0` on the local stack | 67/67, including the 2 Staff queue tests, with `DEMO_PASSWORD` read from the local seed's credentials file |

The first review of this branch missed three older database suites:
`residency-reviews.sql`, `proof-retry-admission.sql`, and
`residency-concurrency.ts`. They still approved without a `method`, so the new
function refused them with `PT400`. The new suite also reused the account IDs that
the legacy step of the replay commits. Both are fixed, and the replay above
shows the whole chain passing.

Screenshots (from the simulated-API harness, whose label still names issue 61):

- [Document checklist at 320 px, worked by keyboard](review-document-checklist-320.png): no horizontal overflow.
- [Approval without a document, reason required](review-exception-reason-desktop.png).

## Not covered

- The shared project. Apply `20261015000200_residency_review_evidence.sql` right
  before deploying; until then the earlier API's approvals receive `400`.
- `tests/database/atomic-actions.sql` on this seeded stack (#72).
