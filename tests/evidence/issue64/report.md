# Combined residency verification, 15 October 2026

Issue: [#64](https://github.com/10Plaiz/its122p-NO/issues/64). Covers #59, #60,
#61, #62, and #63 together, on one revision, after all five were merged and
deployed.

## Target

| Item | Value |
| :--- | :--- |
| Revision | Local suites: `main` at `20a50ed` (#69, report edit-form drafts, web only) on top of `df8ee38` (#73), plus this push's test and documentation changes. Every local run was first made on `df8ee38`, then the typecheck, fast tests, build, full browser suite, and security suite were repeated after rebasing onto `20a50ed`. No application or migration change in this push |
| Live site | `https://kamoti-chi.vercel.app`. The hosted checks ran while production served `df8ee38` (Vercel: success, 09:37 UTC). #69, deployed after them, changes no API or database code |
| Hosted database | Test project `chqyxlyrmudmkanqmpil`, all 23 migrations (owner's `supabase migration list`, after applying `20261015000200`) |
| Local services | Supabase CLI 2.117.0 stack `kamoti`: real Auth, Data API, Storage, and Postgres; 23 migrations; marked `kamoti.test_database = 'disposable'`; fixture and `makati-demo-v1` seed; Mailpit |
| Fresh replay | Database `kamoti_test_63` in the same container: bootstrap, all 23 migrations with the legacy step, then every SQL suite |
| Local accounts | Fixture accounts; one new `security-*`, two `test-account-*`, and the runtime suites' `submission-*` Citizens per run. All `@kamoti.invalid`, all retained (rows are never deleted) |
| Hosted accounts | `fixture-admin`, `fixture-citizen-1`, `fixture-staff-1`, and the proof of `release-session-be8e42fe…@kamoti.invalid` (owner-approved). Nothing else was opened |
| Hosted writes | One `residency.proof_viewed` audit row and normal sign-ins. No account, upload, decision, migration, reset, seed, or fault trigger |

### Policies in force

| Policy | Value | Owner |
| :--- | :--- | :--- |
| Reporting gate | New reports and report photos only after an Administrator approves residency; a pending Citizen keeps every action on reports filed earlier | #59 (owner, 2026-10-05) |
| Citizen quotas, per hour | Reports 5, report photos 15, proofs 3 per account; 50, 150, 30 per network. A database failure refuses with `503` | #60 (owner, 2026-10-05) |
| Account limits | Sign-in 10 per address and client, 30 per client, 20 per address, in 15 minutes; sign-up 5 an hour; stored in Postgres for every instance; a store failure refuses with `503` | KI-14 |
| Proof files | JPG, PNG, WebP, or PDF up to 5 MB, fully decoded (40 MP, 20 PDF pages, 5 s), refused before storage | #62 |
| Review | Bound to the proof and address version shown; a document approval needs four checks; approval without a document needs a reason kept in the audit | #61, #63 (owner, 2026-10-15) |
| Proof access | Administrators only, through a five-minute signed link, audited before the link is returned | #53, #61 |

## Results by criterion

Evidence classes: **Source** (code or fast tests with isolated adapters),
**Local services** (the real Supabase stack above), **Hosted** (the test project
and live site).

| # | Criterion | Evidence | Class | Result |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Revision, policies, target, accounts | This report, sections above | — | Recorded |
| 2 | Sign-up, proof, waiting, approval, a filed report; rejection and resubmission do not reopen reporting | Account browser suite (UA-5 real Mailpit code, UA-8 waiting, rejection, resubmission, approval); security IMP-17 (address change, rejection, re-upload: `403` each time); **new IMP-18**: after approval a complete report gets `201` and is saved | Local services | Pass |
| 3 | Direct API: missing, pending, rejected proof; changed address; inactive; wrong roles; another Citizen's records. Refused writes save nothing | IMP-01, IMP-15 (no proof: no report, photo, file, or notification); IMP-17 (pending, rejected, changed address: record counts unchanged); IMP-14 (inactive); AUTHZ-06 to AUTHZ-15, IMP-05, IMP-08 (roles, other Citizens); fast test: a Citizen's own approval gets `403` | Local services; Source | Pass |
| 4 | Agreed behavior of existing reports; Staff and Administrator work | **IMP-18**: back in review after an address-only change, the Citizen still gets their own history, report detail, timeline, earlier rating, every stored notification, and their reports in the export; edits (`200`); comments on a pending and a resolved report (`201`); rates a report resolved meanwhile (`201`, saved); and withdraws (`200`, cancelled). A new report gets `403 residency_pending` and saves nothing. With the rating route temporarily made to refuse pending Citizens, IMP-18 failed with that `403`, so the case detects the regression. Staff and Administrator browser suites (FUNC-02, FUNC-03, FUNC-06, FUNC-07, filters, users) | Local services | Pass |
| 5 | Quotas across instances, IP changes, restarts, concurrency; counter-store failure | `bun run test:submission-limits` 13/13: IPv4 and IPv6, a restarted API, two independent workers, eleven accounts on one network, forwarded headers, a lock timeout, and RPC failure (`503`, no side effects). Account limits: `auth-rate-limits.sql` 18/18; `503` on store failure in `tests/fast/rate-limit.test.ts` | Local services; Source | Pass |
| 6 | Races between replacement, address change, and decisions | `residency-concurrency.ts` 8/8 on separate connections (one decision, audit, and notification; stale ones get `PT409`); `residency-reviews.sql` 70/70 | Local services (Postgres) | Pass |
| 7 | Malformed files, limits, upload, audit, and cleanup failure keep the current proof | IMP-17 (damaged file: `400`, nothing stored, account unchanged); `proof-files.test.ts`, `residency-http.test.ts` (time limit, Storage and attachment failure, no cleanup call); `residency-review.sql` 24/24 and `residency-reviews.sql` (audit and notification failure roll back each decision) | Local services; Source | Pass |
| 8 | Private storage and the audited Administrator link on a real service | Hosted run below, 17 passed, 1 skipped; IMP-02, IMP-03, IMP-12 locally | Hosted; Local services | Pass |
| 9 | Reuse and extend maintained checks; classes, failures, and skips listed | IMP-18 added to `tests/integration/security.ts`; the waiting screen added to `tests/browser/accounts.browser.ts`. Every run, failure, and skip is listed below | — | Done |
| 10 | Browser evidence; effect on existing users | Screenshots below; [existing users](#effect-on-existing-users) | Local services; Hosted (counts) | Done |
| 11 | Release recommendation; database and file recovery separate from an application revert | [Recommendation](#release-recommendation) | — | Done |
| 12 | Checkpoint comments and owning documentation | #64 checkpoint comment; `SECURITY.md`, `TEST_ENVIRONMENT.md`, and `IMPROVEMENT_REQUIREMENTS.md` updated; earlier issue bodies and evidence left unchanged | — | Done |

## Runs

All local runs used `--retries=0` where the runner supports it.

| Run | Command | Result |
| :--- | :--- | :--- |
| Typecheck, fast tests, build | `bun run typecheck`, `bun run test`, `bun run build` | Pass; 651 tests on `df8ee38`, 656 after rebasing onto `20a50ed` |
| Fresh database replay | Every migration into `kamoti_test_63`, then `api_access`, `atomic-actions`, `residency-reviews`, `residency-review`, `submission-limits`, `proof-retry-admission`, `auth-rate-limits` | Pass: 28, 70, 24, 41, 34, 18, and `api_access` |
| Concurrency | `bun tests/database/residency-concurrency.ts` on the replay | 8/8 |
| Seeded stack SQL | `atomic-actions.sql`, `residency-review.sql` on `kamoti` | 28/28, 24/24 |
| Security | `bun run test:security -- --target 127` | **46/46**, including the new IMP-18; again 46/46 after the rebase |
| Quota runtime | `bun run test:submission-limits` | 13/13 |
| Quota browser | `bun run test:submission-browser` | 4/4 |
| Full browser suite | `npx playwright test --retries=0` | **67/67** alone (4.4 min), with the new waiting check; again 67/67 after the rebase |
| Account browser suite | `npx playwright test tests/browser/accounts.browser.ts` | 8/8 with the new waiting check |
| Review browser suite | `bun run test:browser:residency` (simulated API) | 18/18 |
| Hosted smoke | `bun run test:smoke` | 12/12 |
| Hosted residency checks | Script run once from a scratch folder (below) | 17 passed, 1 skipped |

**Failures, all explained.** An earlier full browser run, started while the
quota runtime and quota browser suites ran against the same database, took 40
minutes and failed 2 of 67: the activity-filter count test (rows were being
added while it compared counts) and a Users search that timed out. Those suites
deliberately revoke a database function and hold row locks, and `LOCAL_DEV.md`
already says to run nothing else against the stack while they run; that run
broke the rule. Both tests passed alone, and the whole suite passed 67/67 alone.

**Skips.** The hosted SHA-256 comparison: the proof opened predates recorded
hashes (legacy backfill). Its 75-byte PDF would be refused by today's #62 checks;
it was stored before them.

## Hosted checks

Read only, apart from one audit row. Signed URLs, tokens, and keys were not
printed or kept.

| Check | Result |
| :--- | :--- |
| Anonymous client: list proofs, download a proof, read `residency_proof_versions` | Refused or empty |
| Citizen token (`fixture-citizen-1`): download another account's proof, list its own folder, read the inventory | Refused or empty |
| Live API proof link: no token `401`, Citizen `403`, Staff `403` | Pass |
| Live API, Administrator, stale version | `409`, and no audit saved |
| Live API, Administrator, current version | `200`, `expires_in` 300, names the current proof version, exactly one `residency.proof_viewed` audit |
| Signed link | Returns the stored file; a changed token is refused |
| SHA-256 of the returned bytes | Skipped: legacy proof without a recorded hash |
| Smoke (`bun run test:smoke`) | 12/12: health, board, stats, sign-in for each role, `401` and `403` gates, role access |

Not run on the hosted project, by the #64 boundaries: sign-up with a real email
code (verified hosted in #50), proof upload, decisions, quota exhaustion, races,
and fault injection. Those are local-services evidence only.

## Browser evidence

Local services unless marked.

Each file is a copy of the screenshot its suite wrote under `EVIDENCE_DIR`.
To retake one, rerun that suite and copy the file again.

| Screenshot | State | Written by |
| :--- | :--- | :--- |
| [Waiting](64-01-waiting.png) | A Citizen whose proof awaits review: the form is replaced by "Waiting for approval"; Check again says "Still awaiting review." | `accounts.browser.ts`, `UA-8-awaiting-approval.png` |
| [Rejection](64-02-rejected.png) | The Administrator's reason, the accepted documents, what is checked, and the upload control | `accounts.browser.ts`, `UA-8-rejected-with-reason.png` |
| [Approval](64-03-approved.png) | Verified resident; every menu link active | `accounts.browser.ts`, `UA-8-approved.png` |
| [Conflict](64-04-review-conflict.png) | Simulated API: the review changed; every decision is disabled until Refresh review | `bun run test:browser:residency`, `issue61/simulated-approval-conflict-desktop.png` |
| [Report quota](64-05-report-quota-mobile.png) | A live `429` on a phone: retry time shown, text, location, and photo kept | `bun run test:submission-browser`, `report-limited-mobile.png` |
| [Proof quota](64-06-proof-quota-desktop.png) | A live `429` on the proof step: retry time shown, the chosen file kept | `bun run test:submission-browser`, `proof-limited-desktop.png` |

## Effect on existing users

Hosted counts on 15 October 2026, after all five changes. Read only.

| Citizens | Active | State | Proof | Count | Effect |
| :--- | :--- | :--- | :--- | ---: | :--- |
| `demo-makati-*` | Yes | Verified | No | 30 | None: confirmed by the one-time script (#54) |
| `fixture-*` | Yes | Verified | No | 2 | None |
| Real addresses | Yes | Pending | No | 11 | Locked until they upload a proof |
| Real addresses | Yes | Pending | Yes | 5 | Can use the site but cannot file reports until an Administrator decides (#59) |
| Real addresses | No | Pending | No | 1 | None (inactive) |
| Synthetic release and migration checks | Mixed | Verified | Yes | 2 | None |

The project is documented as synthetic only, but it holds 24 accounts with
real addresses, including the 17 Citizens above and 5 uploaded proofs. That is
[#74](https://github.com/10Plaiz/its122p-NO/issues/74). Until it is decided, the
5 waiting Citizens need an Administrator's review to file reports again. Every
Citizen created before 3 October was set to pending by
`20261003000200_accounts.sql`.

## Release recommendation

**Keep the residency changes in the current release.** Every criterion passed
on one revision (`df8ee38`, repeated on `20a50ed`), and the hosted checks agree
with the local ones. No defect was found
in the application. Two open items do not block it:

- #74: real-address accounts and documents on the test project (owner decision).
- #67, #70: a name correction that drops verified residency, and proof retention. Both are already listed as accepted risks.

| Issue | Change | Evidence | Recommendation |
| :--- | :--- | :--- | :--- |
| #59 | Approval before new reports and photos | IMP-17, IMP-18, account browser suite, waiting screenshot | Keep |
| #60 | Shared quotas | 13/13 runtime, 4/4 browser, 41 SQL | Keep |
| #61 | Decisions bound to the reviewed version | 8/8 races, 70 SQL, 18/18 browser, hosted stale `409` | Keep |
| #62 | Complete-file checks | IMP-17 damaged file, fast suites | Keep |
| #63 | Recorded approval basis | 24 SQL, IMP-12, 18/18 browser | Keep |

### Recovery

An application revert and a database recovery are different operations. Plan
them separately.

| What | How | Limit |
| :--- | :--- | :--- |
| Application | Redeploy an earlier Vercel deployment, or revert the commit on `main` | Safe only back to `df8ee38`'s database contract. An API from before #61 cannot use the version contract and can overwrite fixed proof paths ([API.md](../../../docs/API.md#deploy-the-review-contract)). An API from before #63 sends approvals that `20261015000200` refuses with `400` |
| #63 function | Re-apply the `admin_change_profile` definition from `20261006000100` | Only if the application also returns to before #63. No table changes |
| #60, #61, KI-14 database objects | Forward fix only | They add tables, columns, and triggers; nothing drops them, and rows are never deleted |
| Proof and photo files | Storage only | A database backup does not contain Storage bytes. Proof objects are never overwritten (#61), so earlier files survive a database restore, but a restore can leave newer objects with no matching row |
| Audit and notifications | Not reversible | Required audits are written in the same transaction as each decision; a recovery keeps them |

## Limits

- Hosted email delivery is from #50, not this run.
- The quota thresholds are a trial policy; this run does not measure real demand or Vercel's client-IP delivery under load.
- The simulated-API browser suite proves dialog behavior, not the network.
- Proof checks are not a malware scan (accepted risk in `SECURITY.md`).
