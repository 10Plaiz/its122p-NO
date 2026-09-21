# Phase 4 security and testing report

This is the single report for Phase 4 testing. Sections A through G, the
evidence index, the bug log, the summary metrics, and the peer evaluation are
all recorded here rather than in separate files, so one document can be
submitted and reviewed as a whole.

The [Phase 4 instructions](Phase4_Instructions.md) own what must be tested and
submitted. The [local-development guide](LOCAL_DEV.md#run-and-verify) owns the
test commands and the environment each suite needs. This report owns the test
cases, their results, and the evidence that supports them.

**Status: no results recorded yet.** The structure, identifiers, and evidence
rules below are in place; later Phase 4 work fills the tables in.

## Test case identifiers

Every test case has an identifier of the form `PREFIX-NN`, where the prefix is
the section the case belongs to and `NN` is a two-digit number that is never
reused, even if the case is later dropped.

| Section | Coverage | Prefix |
| :--- | :--- | :--- |
| A | Input validation | `VAL` |
| B | SQL and query injection | `SQLI` |
| C | Authentication | `AUTH` |
| D | Authorization | `AUTHZ` |
| E | Cross-site scripting | `XSS` |
| F | Functional | `FUNC` |
| G | Usability | `USE` |

Bugs use `BUG-NN` in the same way.

One identifier is the only name a case has. It is used by the row in this
report, the evidence filename, any defect that comes out of the case, and the
automated test that covers it, so all four can be matched without guessing.

- **Automated cases.** A case covered by the fast suite starts its `describe`
  name with the identifier, so `bun run test` output names the case directly.
  Mark the row `Automated` in its Method column.
- **Manual cases.** Anything performed by hand in the browser or against the
  API. Mark the row `Manual` and give it evidence.
- **Evidence filenames.** `PREFIX-NN-short-slug.ext`, for example
  `VAL-04-blank-title-error.png`. One case may have several files; number them
  `VAL-04a`, `VAL-04b`.

### Identifiers already in use

These are allocated by the fast suite in `tests/fast/`. Do not reuse them.

| Identifier | Case | Where |
| :--- | :--- | :--- |
| `VAL-01` | Contact number rule accepts and rejects the documented forms | `tests/fast/validation.test.ts` |
| `VAL-02` | Contact number rule is identical in the form and the API | `tests/fast/validation.test.ts` |
| `VAL-03` | Rejected input returns 400 and names every invalid field | `tests/fast/validation.test.ts` |
| `SQLI-01` | A search term cannot add or change a query filter | `tests/fast/query-safety.test.ts` |
| `SQLI-02` | A search term with nothing left to match is skipped | `tests/fast/query-safety.test.ts` |

## Evidence rules

- Screenshots and recordings are **not committed to this repository**. They are
  kept in the team's shared evidence folder and referenced from the
  [evidence index](#evidence-index) by name and link.
- Every file is named after the case it proves, following the filename rule
  above.
- Evidence uses synthetic accounts and reports only. The safety boundaries in
  the [local-development guide](LOCAL_DEV.md#safety-boundaries) apply to
  evidence as much as to code: no real personal information, no keys, no
  database passwords, and no access tokens visible in a screenshot or
  recording.

## A. Input validation test

| ID | Field or form | Input | Expected result | Actual result | Method | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
|  |  |  |  |  |  |  |  |

## B. SQL injection test

Record how the application keeps a malicious value from being executed as query
text, then the cases that show it.

| ID | Entry point | Payload | Expected result | Actual result | Method | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
|  |  |  |  |  |  |  |  |

**How injection is prevented.** _To be written with the case results._

## C. Authentication test

Cover valid sign-in, wrong password, unknown account, empty submission, sign
out, and reaching a protected page without a session.

| ID | Scenario | Steps | Expected result | Actual result | Method | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
|  |  |  |  |  |  |  |  |

## D. Authorization test

Cover each role against the pages and endpoints it should and should not reach.

| ID | Role | Page or endpoint | Expected access | Actual access | Method | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
|  |  |  |  |  |  |  |  |

## E. Cross-site scripting (XSS) test

| ID | Field | Payload | Expected result | Actual result | Method | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
|  |  |  |  |  |  |  |  |

**How input is kept as data.** _To be written with the case results._

## F. Functional test

Cover every core feature named in the [proposal](Final_Project.md).

| ID | Feature | Test procedure | Expected result | Actual result | Method | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
|  |  |  |  |  |  |  |  |

## G. Usability test

Record who tested, on what device, and what they said about navigation,
readability, interface consistency, control placement, error message clarity,
mobile responsiveness, and overall ease of use.

| ID | Tester | Device and browser | Area | Feedback | Action taken | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
|  |  |  |  |  |  |  |

## Evidence index

One row per evidence file. Nothing in this table is stored in the repository.

| Evidence name | Case ID | Type | Location |
| :--- | :--- | :--- | :--- |
|  |  |  |  |

## Bug and issue log

| ID | Bug or issue | Found by case | Description | Severity | Action taken | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
|  |  |  |  |  |  |  |

Severity is `Critical`, `High`, `Medium`, or `Low`. Status is `Open`,
`Fixed`, or `Won't fix` with a reason. A bug that is fixed in code links the
pull request that fixed it.

## Testing summary

| Metric | Count |
| :--- | :--- |
| Total test cases |  |
| Passed |  |
| Failed |  |
| Fixed |  |
| Remaining issues |  |

## Peer evaluation and contributions

Compiled by the team leader or assistant leader.

| Member | Role | Contributions | Rating |
| :--- | :--- | :--- | :--- |
|  |  |  |  |
