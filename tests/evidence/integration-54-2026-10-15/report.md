# Phase 2 integration close-out, 15 October 2026

Issue: [#54](https://github.com/10Plaiz/its122p-NO/issues/54)

## Target

| Item | Value |
| :--- | :--- |
| Revision | `5df4e0a` plus the uncommitted #54 changes listed in `COMMITS_54.md` |
| Database | Local Supabase CLI 2.117.0 stack `kamoti`, all 21 migrations. The live project has the same 21, per `supabase migration list --linked` |
| Data | Fixture with staff routing; demo seed `makati-demo-v1` with `seed:routing` |
| Shared project | Not written to |

## Results (all with retries off)

| Check | Result |
| :--- | :--- |
| `bun run typecheck` | Pass |
| `bun run test` | 590 pass, 0 fail (581 before, 9 new) |
| `bun run build` | Pass |
| `bunx playwright test --retries=0` | 67/67 (66 before, plus the SW-1 suggestion check) |
| `bun run test:browser:residency` | 17/17 |
| `bun run test:security -- --target 127` | 43/43 |

## Review of the Phase 2 server and database changes

The review scope was `git diff 3ac34c9 origin/main -- src/server supabase/migrations`:
55 files, about 4,900 lines added.

**Security review:** no finding at 80% confidence or above.
- Every new table and function grants access to `service_role` only.
- The functions are `security invoker` with an empty `search_path`.
- Profile writes accept only listed fields.
- Proof paths cannot cross users.
- Closure approval needs a different administrator.

**Code review:** 10 findings.

| # | Finding | Outcome |
| :--- | :--- | :--- |
| 1 | A status change from a stale read could undo a closure approved in between, stranding the report | **Fixed.** The update is conditional on status and closure; a 409 otherwise (WF-10) |
| 6 | Reassigning while a closure request waits credits the work and rating to the new staff member | **Fixed.** Refused until the request is decided, with a guarded write (WF-10) |
| 5 | A failed profile transaction left an orphan login that blocked the address | **Fixed.** The login is removed when the transaction fails (admin-audit test) |
| 8 | A middle name or suffix sent alone was silently dropped | **Fixed.** Now a 400 (admin-audit test) |
| 2 | Proof retries count toward the proof quota | Documented decision, `docs/API.md` "Every retry still counts…" |
| 3 | Quota is charged before validation | Documented decision, `docs/API.md` "Every admitted attempt counts…" |
| 4 | A name correction resets a Citizen verified without a proof to pending, which locks them | Needs a migration and an owner decision. Proposed as a new issue linked to #63 |
| 7 | The workload count truncates above 1,000 open reports | Accepted limit (about 150 reports today) |
| 9 | Exports recount the total for every chunk | Accepted. Performance only |
| 10 | The "already verified" check is duplicated in three places | Accepted cleanup |

## SW-1 staff routing data

- **Fixture:**
  - staff 1 handles Road and Streetlight, in San Lorenzo and Bel-Air
  - staff 2 handles Drainage, in Poblacion
- **Demo:** `seed:routing` derives specializations and areas from each demo staff
  member's assigned reports. Locally that added 24 specializations and 12 areas,
  and a second plan showed 0 missing.
- **Browser:** the Assign dialog lists Fixture Staff One under "Streetlight in
  Bel-Air" (`ADMIN-assign-suggestion.png`).

## KI-05 follow-up (live check, 15 October 2026)

**Result:** signing in on the live site as `demo-makati-citizen-1` opened the
proof-upload step, so KI-05 **failed**.

**Cause:** the demo seed reached live before the accounts migration.
- `20261003000200_accounts.sql:58` then set every existing citizen to `pending`
  without a proof.
- The seed's confirmation step only matched citizens with no status at all, so a
  re-run would not have helped.

**Fix:**
- `seed:apply` now confirms demo citizens that are `pending` with no proof, or
  that have no status. It does this after its unchanged-rows check.
- `seed:plan` reports the number as `confirmCitizens`.
- `seed:verify` fails while any remain.
- A fast test covers the rule: it leaves rejected citizens and citizens who
  uploaded a proof unchanged.

**Local reproduction:** all 30 demo citizens were set to `pending`.
1. `verify` failed: "30 demo citizens are not confirmed residents".
2. `apply` confirmed 30, after checking that 1,886 existing rows were unchanged.
3. A second `apply` confirmed 0, and `verify` passed.

## Limitations

- B5's move of the users page to DataTable and B10's type-file merge were
  omitted by team decision.
- The photo purge is manual; there is no cron.
- Administrators cannot resolve a report directly. Every closure is a staff
  request followed by administrator approval.
- In-memory rate limits apply per process.
- The refresh token is kept in `localStorage`.
- SMS is deferred.
- Email-code purpose binding is not tested.
- Finding 4 is open.
- Live steps not run from here:
  - `seed:routing` and the fixture routing on the live project
  - demo citizens confirmed verified on the live site (KI-05)
  - a live check of the Assign suggestion
