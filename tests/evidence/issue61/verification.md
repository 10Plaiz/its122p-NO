# Issue 61 verification

Verified on 6 October 2026 from `feat/residency-review-version`, based on
`main` at `ad901c1`. The target PR base is `main`.

## Results

| Check | Observed result |
| :--- | :--- |
| `bun run typecheck` | Passed API, web, deployment, and test checks. |
| `bun run test` | 580 tests passed. No failures. |
| `bun run build` | API compilation and production web build passed. |
| Native PostgreSQL 16 replay | All 21 migrations applied. Legacy proofs were prepared before the version migration. |
| `supabase/tests/api_access.sql` | Access checks passed, including the private proof inventory. |
| Database SQL suites | 28 atomic-action, 70 residency, 41 quota, and 34 receipt-admission assertions passed. |
| `tests/database/residency-concurrency.ts` | Eight controlled races passed on separate database connections. |
| `bunx playwright test --config playwright.issue61.config.ts` | 17 Chromium scenarios passed with simulated API responses. |

The native replay executed the SQL bodies through Bun SQL after WSL command
launches failed. It used a fresh local database with the disposable marker.
The [local guide](../../../docs/LOCAL_DEV.md#residency-version-checks) gives the
replay order and commands. Raw logs and intermediate captures remain local.

## Acceptance criteria

| Issue criterion | Evidence and result |
| :--- | :--- |
| Immutable proof identity and account version | The [migration](../../../supabase/migrations/20261006000100_residency_review_versions.sql) binds each proof to its owner, path, and hash. SQL immutability and version checks passed. |
| Preserve existing records | The residency SQL suite verified pending, verified, and rejected legacy rows after migration. Paths, decisions, reviewer details, and edit timestamps were preserved. |
| Save the displayed version atomically | HTTP tests checked version forwarding. SQL checks verified the locked comparison and atomic decision, audit, and notification. |
| Refuse stale proof, address, or decision | SQL and HTTP conflicts changed no residency state or decision effects. Browser conflicts kept the dialog open and blocked decisions. |
| Two simultaneous decisions | A real database race accepted one decision and returned PT409 to the other. One audit and one notification were saved. |
| Upload and review races | Same-format and different-format replacements invalidated old reviews. Review-first races preserved both later approvals and rejections. |
| Upload and cleanup failures | HTTP fault tests retained current bytes after Storage or attachment failure. No cleanup call ran. SQL refused attachment without object metadata. Signed URL checks identified the exact proof and required an access audit. |
| Faults, addresses, reviewers, and retries | SQL rollback tests, eight database races, and HTTP fault tests covered these cases. Exact committed retries added no upload effect and preserved later decisions. |
| Browser conflicts and mandatory audits | 17 scenarios covered conflict, failed refresh, delayed proof responses, document links, and upload retries. Refresh after rejection retained the selected file. Audit and notification failures rolled back decisions. |
| Owning documentation | [API.md](../../../docs/API.md#residency-reviews) defines the contract and deployment procedure. The architecture, frontend, and local test guides were updated. |

## Selected visual evidence

These captures show the implemented flow with simulated API responses.
They are not hosted production evidence or baseline screenshots.

- [Desktop conflict](simulated-approval-conflict-desktop.png): decisions are disabled until refresh.
- [Mobile conflict](simulated-approval-conflict-mobile.png): refresh and decision controls remain visible at 375 by 812 pixels.
- [Refreshed review](simulated-refreshed-review-desktop.png): the current name, address, and unopened proof replace the old snapshot.

## Limits and deployment

The database used minimal Auth and Storage metadata tables. The HTTP tests used
isolated Supabase adapters. These runs did not verify hosted Auth, real Storage
file operations, email delivery, or the shared security integration suite.
The affected live integration callers were updated and typechecked but not run.

No shared Supabase migration or deployment was performed. The migration owner
must apply both new migrations with the matching API and web build. An old
application build cannot safely use this contract. See the
[deployment procedure](../../../docs/API.md#deploy-the-review-contract).
The proposed retention period is 30 days after replacement. It needs owner
approval. This PR enables no automatic proof deletion.
