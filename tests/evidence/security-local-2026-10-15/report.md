# Security integration run, 15 October 2026

Issue: [#53](https://github.com/10Plaiz/its122p-NO/issues/53)

## Target

| Item | Value |
| :--- | :--- |
| Revision | `7ddc302` plus the uncommitted #53 changes to `tests/integration/security.ts` and `docs/LOCAL_DEV.md` |
| Database | Local Supabase CLI 2.117.0 stack `kamoti`, all 21 migrations |
| Data | Fixture accounts and reports, plus one new `security-*@kamoti.invalid` citizen per run |
| Command | `bun run test:security -- --target 127` |
| Shared project | Not contacted. The runner now refuses any `SUPABASE_URL` that is not `127.0.0.1` or `localhost` |

## Results

The runner passed **43/43** on three consecutive runs, with no cleanup errors.
Fixture citizens and reports were back in their original states after each run.
Before this change, the same stack passed the original 39 cases.

| Category | Cases | Result |
| :--- | ---: | :--- |
| Authentication (AUTH-04 to AUTH-11) | 8 | Pass |
| Authorization (AUTHZ-06 to AUTHZ-15) | 10 | Pass |
| SQL injection (SQLI-06 to SQLI-10) | 5 | Pass |
| Cross-site scripting (XSS-01 to XSS-04) | 4 | Pass |
| Phase 2 improvements (IMP-01 to IMP-11) | 11 | Pass |
| **New for #53 (IMP-12 to IMP-15)** | 4 | Pass |
| Input validation (VAL-10) | 1 | Pass |

New cases:

| Case | What it proves |
| :--- | :--- |
| IMP-12 | A citizen uploads a real proof through the API. An Administrator gets a 200 with a five-minute link that returns the same bytes, and exactly one `residency.proof_viewed` audit row. A stale review version gets 409 |
| IMP-13 | A report goes through the real workflow: assigned, in progress, repair photo, closure request, then approval. Two ratings sent at once return 201 and 409, a third returns 409, and one rating is saved |
| IMP-14 | After deactivation, the old access token gets 403 on `/api/auth/me` and `/api/reports`, sign-in gets 403, and refresh is refused |
| IMP-15 | A locked citizen's new report and photo upload get 403. Report, photo, storage-file, and notification counts do not change |

## Map to #53

| Criterion | Cases |
| :--- | :--- |
| Locked citizens get 403 `residency_required` | IMP-01, IMP-15 |
| No direct client read of `residency-proofs` | IMP-02 |
| Administrator proof link only through the intended API | IMP-03 (refusals), IMP-12 (working, audited link) |
| Feedback 403, 400, 409 | IMP-05, IMP-13 |

The 4 October checkpoint's other release cases are now covered elsewhere:
- Deactivated access: IMP-14.
- Self-approval after promotion, stale closure review, and simultaneous approvals:
  `tests/database/atomic-actions.sql`.

## Limits

- Local stack only. Hosted Auth, Storage, and RLS were verified separately in the
  4 October release checkpoint. This runner deliberately refuses hosted targets.
- Each run keeps one deactivated synthetic citizen, its proof version, a rated
  `[TEST]` report, and audit rows. Accounts, proof versions, and ratings are
  never deleted by design.
- Wrong-purpose and cross-account email codes are not covered. That was a team
  decision on 15 October.
- #59 will change who may report while a proof is pending. IMP-15 checks a citizen
  with no proof, so it holds under either rule.
