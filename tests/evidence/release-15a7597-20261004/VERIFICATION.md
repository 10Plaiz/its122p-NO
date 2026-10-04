# Integration release verification

Checked on 4 October 2026. Application changes were tested at `15a7597` in
`review/integration-local`, against the approved shared Supabase project.
Subsequent changes add documentation, database validation, and test coverage.
This record describes candidate verification before the application release.
Production verification belongs in PR #56 and its release checkpoint.

## Account security

The owner entered real email codes in a headed browser. Codes, credentials,
recipient details, and session tokens are excluded from this evidence.

- Unconfirmed password sign-in was refused.
- Custom SMTP delivered the six-digit signup code. A wrong code was refused.
  The correct code opened the residency-proof step. A used code was refused.
  The confirmed account could sign in.
- The final recovery run passed 12 checks. A wrong recovery code was refused.
  The correct code changed the password without requiring the forgotten password.
  The used code, old password, old access session, and old refresh session were
  refused. The new password worked. Recovery preserved the residency restriction.
- Direct password-change checks refused missing or incorrect current passwords.
  The correct current password was accepted.

The initial signup driver completed its seven account checks, then stopped at
an ambiguous sign-out selector. An earlier recovery run changed the password,
but the candidate servers became unavailable before the remaining checks.
The final controlled recovery run completed all checks after the servers were
restored. The cause of the interruption was not established.

Safe visual evidence:

- [Confirmed email opens the proof step](AUTH-real-code-confirmed-desktop.png).
- [New password opens the same restricted account](AUTH-real-reset-signin-success-desktop.png).

## Database and access

All 18 migrations replayed through the Supabase CLI on disposable PostgreSQL.
That database supplied SQL dependencies for Auth and Storage. It did not run
their services. A separate database restored the actual pre-integration public
schema and data before applying the pending migrations.

- [Atomic database checks](../../database/atomic-actions.sql) passed 28 cases,
  including injected history, audit, and notification failures. These checks
  ran only on the disposable database and rolled back their records.
- [API access checks](../../../supabase/tests/api_access.sql) passed. Anonymous
  and authenticated clients lacked protected table privileges. Public access
  omitted private account columns and retained an approved rejection reason.
- Hosted API checks proved private bucket denial, Administrator proof access
  through a five-minute URL, and a saved proof-view audit entry.
- Proof upload unlocked a pending Citizen. Rejection locked reporting again.
  Reporting, notifications, exports, and feedback all returned the residency
  denial for a locked Citizen.
- Deactivation refused an existing session, reporting, refresh, and sign-in.
  Reactivation restored the synthetic account.
- Closure checks refused self-approval after a role change, stale requests,
  and duplicate review. Two simultaneous approvals produced one success and
  one conflict, with one approval history and one audit entry.
- Feedback checks refused unresolved reports, other Citizens, and duplicates.

The reviewed migrations are applied on shared Supabase. The Makati bounding-box
validation preserved every existing pin. The still-deployed main passed all
12 smoke checks after database validation. Main's old registration code still
auto-confirms accounts until the candidate application is deployed.

The baseline archive contains Auth users and Storage metadata, but not Storage
file bytes. Auth configuration was saved separately. A Git rollback does not
restore database or Auth state. Synthetic shared test records were retained.
The legacy security script was not run because it deletes test records.

## Browser and Maps

There are 37 distinct passing browser cases across runs. This is not one full
green run. The initial 42-case run passed 26, failed nine reporting cases with
locked Citizen fixtures, and skipped seven Mailpit-dependent cases. Explicit
Administrator review of only the affected synthetic Citizens allowed all nine
focused cases to pass. No fixture password reset or shared reseed was used.

Two additional session cases passed across focused runs: refused-token refresh,
and mobile idle warning, sign-out, sign-in, and manual draft restoration. The
first draft test used an incorrect storage key; the corrected test follows the
actual per-account storage and Restore draft interface.

- [Restored unsent draft on mobile](RS-5-draft-restored-after-signin-mobile.png).
- [Places selection and report pin](MAPS-places-selected-desktop.png).

The local Maps test selected Makati City Hall and enabled Continue. It recorded
no page or console errors. Production Maps, Places, and Google Cloud key
restrictions still need separate evidence. Avoid repeated paid Maps calls.

## Static checks and remaining limits

Typecheck passed for API, web, deployment, and tests. The fast suite passed
530 tests with no failures. The production build and diff whitespace check
passed. These results do not replace hosted or browser verification.

Seven Mailpit cases remain skipped. A full local Supabase service replay was
not performed. The owner approved direct application of reviewed shared
migrations with baseline recovery information and immediate main checks.
Privileged profile changes and closure are transactional; ordinary status,
assignment, and other best-effort audit writes still have separate boundaries.
Auth account creation cannot join a PostgreSQL profile transaction. A failed
profile write can leave an Auth login without application access.

Original issue bodies, improvement requirements, transcripts, historical
handoffs, unrelated worktrees, and ordinary records were preserved.
