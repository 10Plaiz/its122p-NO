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
| Uncertain uploads | A stored file no proof record points to (an upload that never reached an account, or a file replaced before proof records began on 6 October) goes 30 days after it was stored. Attaching stops at 29 days, so a listed file can never become current between the listing and its removal |
| Failed removals | Files go first, then the row is recorded in database time; a failed batch is reported (`500`, with files removed and rows recorded counted separately) and a rerun finishes it, since removing a missing file is a no-op |
| Record of each run | A required audit (`phase: "started"`, with the listed counts) is written before any file goes; if it fails, nothing is removed. The outcome follows (`"finished"`) |
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
| `tests/database/proof-retention.sql` | Failed before the migration (no `file_removed_at`); 27/27 after it, on the seeded stack and the fresh replay, including the 29-day attach stop and recording in database time |
| Other database suites on the replay | `api_access`, `atomic-actions` 28, `residency-reviews` 70, `residency-review` 24, `submission-limits` 41, `proof-retry-admission` 34, `auth-rate-limits` 18; concurrency 8/8 |
| `tests/fast/proof-retention.test.ts` | 11/11: dry run, batches, recording only proofs with a row, rerun, refused Storage batch, failed record (files still counted as removed), listing failure, the start audit stopping the run, backlog over the limit |
| Typecheck, fast tests (667), build | Pass |
| Security suite | 46/46 |
| Full browser suite | 67/67, `--retries=0` |

## End to end on real Storage

On the local stack, one synthetic Citizen (`security-*@kamoti.invalid`) with a
current proof was given a proof replaced 40 days ago, one replaced 5 days ago,
and an unattached upload created 31 days ago. The fixture Administrator then
used the dashboard:

| Step | Result |
| :--- | :--- |
| Check expired proofs | "1 replaced proof and 1 stored file no proof record points to are past the 30-day retention period." |
| Remove, then confirm | "Removed 2 proof files." |
| Check again | "Nothing to remove." |
| Storage and rows afterwards | 40-day file gone, row recorded; 5-day file and row kept; unattached file gone; current proof kept |
| Activity log | `maintenance.proofs_purged`: `started` (listed 1 + 1, removed 0) before any file went, then `finished` (removed 2, recorded 1); each check as `checked` |

Screenshots: [confirmation](70-01-confirm.png), [after removal](70-02-removed.png),
[320 px](70-03-mobile.png) (no horizontal overflow).

## Not covered

- The shared project. Its proofs from before #61 have no recorded hashes, which
  this does not need: removal uses the stored path.
- A scheduled job. As with photos, an Administrator starts the cleanup.
- Current proofs of inactive or abandoned accounts. They are not "replaced", so
  the rule keeps them; #74 asks the owner about such accounts on the test project.

## Code review

A review of the branch found eight issues; six were fixed before the PR:

| Finding | Outcome |
| :--- | :--- |
| A late retry could attach a listed file just before its removal | Fixed: attaching stops at 29 days |
| `file_removed_at` came from the API clock but was checked on the database clock | Fixed: `record_residency_proof_files_removed()` uses database time |
| Files removed but not recorded were reported as not removed | Fixed: `removed` and `recorded` are counted separately |
| The required audit ran after deletion, with an "Access was not granted" message | Fixed: a required `started` audit comes first (`503` and nothing removed if it fails) |
| After a failed run the panel offered the stale count | Fixed: it drops the count, says how many files went, and asks for a new check |
| Files replaced before 6 October were called "uploads that never reached an account" | Fixed: described as stored files no proof record points to |
| The panel and the loop repeat the photo versions | Not taken: the counts and audit order now differ from photo retention, and merging would change tested photo behavior outside #70 |
