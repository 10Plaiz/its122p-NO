# Name corrections keep the residency decision, 15 October 2026

Issue: [#67](https://github.com/10Plaiz/its122p-NO/issues/67)

## Decision (owner, 2026-10-15)

- An Administrator's name-only correction keeps a verified decision. The
  `user.updated` audit records `residency_kept: "verified"`.
- A Citizen's own name change still returns to review, because the #63 approval
  checked the name on the document.
- Address and proof changes return to review, from anyone. A rejection stays.

## Target

| Item | Value |
| :--- | :--- |
| Revision | `feat/67-admin-name-corrections` from `main` at `aeffb40` |
| Database | Local Supabase CLI stack `kamoti`, 24 migrations, marked disposable; and a fresh replay of all 24 into `kamoti_test_63` |
| Shared project | Not contacted. `20261015000300_admin_name_corrections.sql` is not applied there |

## Results

| Check | Result |
| :--- | :--- |
| `tests/database/name-corrections.sql` | Failed before the migration ("an administrator's name fix keeps a verified decision with a proof"); 14/14 after it, on the seeded stack and the fresh replay |
| Other database suites on the replay | `atomic-actions` 28, `residency-reviews` 70, `residency-review` 24; concurrency 8/8 |
| `bun run test:security -- --target 127` | 47/47, with the new IMP-19 through the API: an Administrator's fix keeps fixture Citizen 2 verified and past the residency gate; the Citizen's own name change returns to review and the gate refuses. The account is restored afterwards |
| Full browser suite | 67/67, `--retries=0` |
| Typecheck, fast tests (656), build | Pass |

The SQL suite covers: a fix with and without a proof (the #67 lockout), the
version still changing (a review opened before the fix gets `409`), the
Citizen's own name change, an address change, a pending and a rejected
account, a later update outside the function in the same transaction, and a
failed audit that leaves the name, the decision, and the mark unchanged.

## Browser

My account warned only about address changes, so a Citizen who changed their
name was locked out without warning. It now says so before saving:

- [Desktop](67-01-name-warning-desktop.png): fixture Citizen 1, verified with no
  proof on file, changes the last name and is told a proof will be needed.
- [320 px](67-02-name-warning-320.png): the same, with no horizontal overflow.

Nothing was saved in either check.

## Not covered

- Administrators have no screen for editing a name; the correction is made
  through `PATCH /api/admin/users/:id`, as #67 describes.
