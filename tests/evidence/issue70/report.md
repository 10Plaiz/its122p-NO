# Proof retention, 15 October 2026

Issue: [#70](https://github.com/10Plaiz/its122p-NO/issues/70)

## Decision (owner, 2026-10-15)

A residency proof file is kept 30 days after it stops being current. Rows are
never deleted.

## How each concern in #70 is covered

| Concern | Handling |
| :--- | :--- |
| Audit needs | Decision and access audits keep every proof's identity and path; each replaced proof's row records `file_removed_at` |
| Signed links | Issued only for the current proof, for five minutes; a file replaced 30+ days ago has no open link |
| Uncertain uploads | An upload that never reached an account has no version row; it goes 30 days after the object was created. An attached file always has a row, so it is never treated as unattached |
| Failed removals | Files go first, then the row is recorded; a failed batch is reported (`500`) and a rerun finishes it, since removing a missing file is a no-op |
| Current proof | Never listed; the guard refuses to record its removal |
| Early removal | The 30 days live in the database: the listing function and a check constraint (`file_removed_at >= superseded_at + 30 days`) |

## Target

| Item | Value |
| :--- | :--- |
| Revision | `feat/70-proof-retention` from `main` at `aeffb40` |
| Database | Local Supabase CLI stack `kamoti` (real Storage), marked disposable; and a fresh replay of this branch's 24 migrations into `kamoti_test_63` |
| Shared project | Not contacted. `20261015000400_proof_retention.sql` is not applied there |

## Results

| Check | Result |
| :--- | :--- |
| `tests/database/proof-retention.sql` | Failed before the migration (no `file_removed_at`); 20/20 after it, on the seeded stack and the fresh replay |
| Other database suites on the replay | `api_access`, `atomic-actions` 28, `residency-reviews` 70, `residency-review` 24, `submission-limits` 41, `proof-retry-admission` 34, `auth-rate-limits` 18; concurrency 8/8 |
| `tests/fast/proof-retention.test.ts` | 9/9: dry run, batches, recording only proofs with a row, rerun, refused Storage batch, failed record, listing failure, backlog over the limit |
| Typecheck, fast tests (665), build | Pass |
| Security suite | 46/46 |
| Full browser suite | 67/67, `--retries=0` |

## End to end on real Storage

On the local stack, one synthetic Citizen (`security-*@kamoti.invalid`) with a
current proof was given a proof replaced 40 days ago, one replaced 5 days ago,
and an unattached upload created 31 days ago. The fixture Administrator then
used the dashboard:

| Step | Result |
| :--- | :--- |
| Check expired proofs | "1 replaced proof and 1 upload that never reached an account are past the 30-day retention period." |
| Remove, then confirm | "Removed 2 proof files." |
| Check again | "Nothing to remove." |
| Storage and rows afterwards | 40-day file gone, row recorded; 5-day file and row kept; unattached file gone; current proof kept |
| Activity log | One `maintenance.proofs_purged` per run, dry runs included; the removal run records `removed: 2` |

Screenshots: [confirmation](70-01-confirm.png), [after removal](70-02-removed.png),
[320 px](70-03-mobile.png) (no horizontal overflow).

## Not covered

- The shared project. Its proofs from before #61 have no recorded hashes, which
  this does not need: removal uses the stored path.
- A scheduled job. As with photos, an Administrator starts the cleanup.
- Current proofs of inactive or abandoned accounts. They are not "replaced", so
  the rule keeps them; #74 asks the owner about such accounts on the test project.
