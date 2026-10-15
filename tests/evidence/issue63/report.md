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
| Review SQL | `psql ... -f tests/database/residency-review.sql` | 21/21 |
| Fast suite | `bun run test` | 650 pass, including `tests/fast/residency-review.test.ts` |
| Security suite | `bun run test:security -- --target 127` | 45/45; IMP-12 now proves an approval with no basis gets `400` and the audit records `method` and `checks`; IMP-17 (#59) sends the document basis |
| Account browser suite | `npx playwright test tests/browser/accounts.browser.ts` on the local stack | 8/8; the Administrator ticks the four checks before Accept the document, and the Citizen waits for approval (#59) |
| Review browser suite | `bun run test:browser:residency` (simulated API) | 18/18 after the rebase. One earlier run had a single intermittent console-error failure in the mobile conflict test; it passed alone and on both reruns, and its message was not captured |
| Full browser suite | `npx playwright test` on the local stack | 65 passed; the 2 Staff queue tests that sign in with the local `DEMO_PASSWORD` were not runnable here |

Screenshots (from the simulated-API harness, whose label still names issue 61):

- [Document checklist at 320 px, worked by keyboard](review-document-checklist-320.png): no horizontal overflow.
- [Approval without a document, reason required](review-exception-reason-desktop.png).

## Not covered

- The shared project. Apply `20261015000200_residency_review_evidence.sql` right
  before deploying; until then the earlier API's approvals receive `400`.
- `tests/database/atomic-actions.sql` on this seeded stack (#72).
