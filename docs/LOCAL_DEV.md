# Local development

This guide owns local prerequisites, environment setup, development commands,
and safety boundaries. Use [API.md](API.md) for endpoint contracts and the
reviewed database migration procedure.

## Prerequisites

- Bun 1.4 or newer
- Node.js 22 or newer
- A Supabase project for local development
- Supabase CLI access through `bunx supabase`

## First setup

From the repository root:

```bash
bun install
cp .env.example .env
bunx supabase login
bunx supabase link --project-ref YOUR_PROJECT_REF
bunx supabase migration list
```

Create a fresh development project in the Supabase dashboard before linking.
Enable the Data API and automatic Row Level Security, and disable automatic
exposure of new tables. Complete CLI login in the same environment where the
commands run.

Fill the ignored `.env` file with values from the linked Supabase project:

| Variable | Purpose |
| :--- | :--- |
| `PORT` | Local Express port, normally `4000` |
| `CORS_ORIGIN` | Allowed local browser origin, normally `http://localhost:5173` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Public key used by the API for authentication requests |
| `SUPABASE_SECRET_KEY` | Server-only key used by Express for protected data access |

Follow the reviewed procedure in [API.md](API.md#database-migrations) for any
database migration operation.

## Run and verify

| Command | Purpose |
| :--- | :--- |
| `bun run dev` | Run Vite on port 5173 and Express on port 4000 |
| `bun run dev:web` | Run only the Vite frontend |
| `bun run dev:api` | Run only the Express API in watch mode |
| `bun run typecheck` | Check frontend, API, and deployment TypeScript |
| `bun run test` | Run the fast test suite in `tests/fast/` |
| `bun run test:security -- --target REF` | Run the security integration test suite against Express and Supabase |
| `bun run test:smoke` | Run deployed smoke verification against the test site |
| `bun run test:browser` | Run Playwright browser automation suite and capture evidence screenshots |
| `bun run build` | Compile the API and build the web application |
| `bun run start` | Run the compiled API with Node.js |

Open `http://localhost:5173`. Vite forwards `/api/*` to the local Express
server. A basic API check is available at `http://localhost:4000/api/health`.

## Test suites

Suites are separated by what they need to run, so the fast one can run on every
change and the others only when their environment is ready.

| Suite | Command | Needs |
| :--- | :--- | :--- |
| Fast | `bun run test` | Nothing beyond `bun install` |
| Security integration | `bun run test:security -- --target YOUR_PROJECT_REF` | A running Express API and linked Supabase project with synthetic fixture accounts |
| Database access | `psql` command below | A disposable database with every migration applied |
| Smoke | `bun run test:smoke` | Deployed test site or running app with fixture data |
| Browser automation | `bun run test:browser` | Deployed test site or local app with fixture accounts, and Chromium installed via `bunx playwright install chromium` |

The fast suite lives in `tests/fast/` and covers logic that can be checked on
its own: no database, no running server, no browser, and no test runner beyond
the one built into Bun. It proves input validation schemas, search filter
character stripping, role authorization rules, report ownership, pending-only
edits, and safe public error handling. CI runs it on every pull request next to
`bun run typecheck` and `bun run build`. Keep that boundary: a test that needs
a database, a deployed site, or a browser belongs in another suite, not in
`tests/fast/`. `bun run typecheck` checks tests via `typecheck:test` alongside
application sources.

The security integration suite lives in `tests/integration/security.ts` and
verifies the live Express API and Supabase database against the Phase 4 security
matrix: authentication workflows, role-based endpoint access, search parameter
SQL injection resilience, XSS plain-data storage, and error masking. It runs
with:

```bash
bun run test:security -- --target YOUR_PROJECT_REF
```

Required runtime inputs:
1. `--target YOUR_PROJECT_REF`: Must match the project ref in `SUPABASE_URL`.
2. Fixture password: Provided through `--password <password>`, the `FIXTURE_PASSWORD`
   environment variable, or piped stdin/interactive prompt.

The integration suite is safe to rerun: it restores any fixture report titles
it modifies, deletes temporary test records, and never mutates ordinary user
accounts or reports. Tokens and credentials are suppressed from logs.

The database suite verifies access boundaries on a disposable database after
applying all migrations:

```bash
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/api_access.sql
```

It creates synthetic records inside a transaction and rolls them back. Do not
run it against a database that is not approved for testing.

The browser automation suite lives in `tests/browser/` and runs Playwright
tests against Chromium. It exercises citizen report submission, editing,
cancellation, staff queue transitions, remarks, admin metrics, and multi-viewport
responsive layouts across mobile (375x812), tablet (768x1024), and desktop (1280x800).
It automatically captures full-page evidence screenshots to `tests/evidence/`.

```bash
bunx playwright install chromium
bun run test:browser
```

After every run, the suite deletes what the tests wrote: reports titled `[TEST] …`
and the staff test's remark, both only when owned by fixture accounts. It runs only
when `.env` has a working `SUPABASE_SECRET_KEY` for a project that has every fixture
account; otherwise it prints why and deletes nothing. `[FIXTURE]` reports are kept.
Run `bun run test:cleanup` to do the same cleanup without running the tests.

Configuration and runtime parameters:
- `PLAYWRIGHT_BASE_URL`: Base target deployment (defaults to `https://kamoti-chi.vercel.app`).
- `FIXTURE_PASSWORD`: Fixture account password (defaults to `Password123!`).

Test case identifiers, results, evidence, and defects belong in the
[Phase 4 test report](Phase4_Test_Report.md), not in this guide.

## Safety boundaries

- Never commit `.env`, credentials, access tokens, database passwords, or real
  personal information.
- Never place `SUPABASE_SECRET_KEY` or another secret in a `VITE_*` variable.
- Do not share the database password or Supabase CLI access token through the
  repository, issues, or pull requests.
- Use synthetic accounts, reports, photos, and contact data for development and
  evidence.
- Confirm the target project before any command that changes shared Supabase
  state.

## Synthetic development data

The `bun run fixture` command creates or reuses a small, clearly marked set of
synthetic accounts and reports for local development and verification work. It
is limited to local development and is safe to rerun. The separate
[Makati demo seed](#makati-demo-seed) populates the shared presentation site.

### Command and required runtime inputs

```bash
bun run fixture -- --target YOUR_PROJECT_REF
```

Three runtime inputs are required, in this order:

1. `--target YOUR_PROJECT_REF` must equal the project ref in `SUPABASE_URL`
   (the first part of the project hostname). The command refuses to run when
   the two do not match, so a run can never be aimed at an unapproved project
   by accident.
2. The command then asks for the confirmation phrase `KAMOTI-APPLY-FIXTURE`.
   This phrase belongs to this fixture only. Any other input stops the run
   before anything is written.
3. Finally the command asks for a fixture password (8-72 characters, hidden
   input). For local development and manual verification, use the standard test
   password `Password123!`. For scripted or non-interactive runs, pipe the
   confirmation phrase and password into stdin:

```bash
printf "KAMOTI-APPLY-FIXTURE\nPassword123!\n" | bun run fixture -- --target YOUR_PROJECT_REF
```

### Expected aliases and report states

Accounts. Aliases are stable and use the reserved `.invalid` domain. All fixture accounts use the standard test password `Password123!`:

| Alias | Role | Default Password | Notes |
| :--- | :--- | :--- | :--- |
| `fixture-admin@kamoti.invalid` | Administrator | `Password123!` | Full admin access |
| `fixture-citizen-1@kamoti.invalid` | Citizen | `Password123!` | Owns two fixture reports |
| `fixture-citizen-2@kamoti.invalid` | Citizen | `Password123!` | Owns one fixture report |
| `fixture-staff-1@kamoti.invalid` | Staff | `Password123!` | Has one fixture report assigned |
| `fixture-staff-2@kamoti.invalid` | Staff | `Password123!` | Has no report assignments |

Reports. Titles are stable and start with `[FIXTURE]`:

| Title | Owner | Status | Assigned staff |
| :--- | :--- | :--- | :--- |
| `[FIXTURE] Broken streetlight on Sample Avenue` | citizen-1 | `pending` | none |
| `[FIXTURE] Overflowing drainage canal on Test Street` | citizen-2 | `pending` | none |
| `[FIXTURE] Pothole cluster on Demo Boulevard` | citizen-1 | `under_review` | staff-1 |

This data supports the standard verification checks without manual repair:
citizen owner access, other-citizen denial, assigned-Staff access,
unassigned-Staff denial, Administrator access, owner editing while a report is
pending, and rejection after a report leaves pending.

### Rerun behavior

Running the command again is safe. It creates only the fixture records that
are missing, reuses the existing ones without duplicates, and corrects
fixture-owned records only when they drifted from the table above — for
example, when a test moved a fixture report out of `pending`. It also resets
the five fixture passwords to the password you supply in that run, so the
logins always work. Ordinary accounts and reports are never deleted, reset,
rewritten, deactivated, or reassigned.

### Cleanup boundary

No reset or cleanup command exists, and none should be added. To remove the
fixture from a development project, do it manually and narrowly:

1. Delete the three reports whose titles start with `[FIXTURE]`.
2. Delete the five auth users with `fixture-*@kamoti.invalid` email addresses
   through the Supabase dashboard or a targeted admin API call. Their profiles
   are removed by the database cascade.

Reports must be deleted first, because the schema prevents deleting a profile
that still owns reports.

## Makati demo seed

The presentation dataset is separate from the five fixture accounts above.
It creates 30 demo citizens, five staff, one administrator, and 150 reports
across the six standard categories. The reports cover six months up to a fixed
reference date. Their titles start with `[DEMO]`, addresses identify synthetic
locations in Makati, and accounts use `demo-makati-*@kamoti.invalid` addresses.
Locations are illustrative and do not identify verified incidents.

| Status | Seed reports | Public |
| :--- | ---: | :--- |
| Pending | 30 | No |
| Under review | 30 | Yes |
| In progress | 30 | Yes |
| Resolved | 50 | Yes |
| Cancelled | 10 | No |

Reports include assignment and status history, remarks, notifications, and a
selection of initial and resolution images. Images are labelled illustrations,
not real incident photos. Staff 5 has an empty queue. Existing reports and
fixture accounts are preserved, so total dashboard counts exceed the seed counts.
This is demo data, not a concurrent traffic or performance test.

### Generate, preview, apply, verify

Run from the repository root with Bun. Generate does not connect to Supabase.
The other commands use the private `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.

```bash
bun run seed:generate --seed 42 --as-of 2026-09-27
bun run seed:plan --target chqyxlyrmudmkanqmpil
# After reviewing the target and planned counts:
bun run seed:apply --target chqyxlyrmudmkanqmpil
bun run seed:verify --target chqyxlyrmudmkanqmpil
```

Generation writes `.seed/makati-demo-v1.json`. The runner validates it against
the deterministic generator before any remote writes. Changing its rows by hand
is rejected. A fingerprint covers the manifest and image bytes. Auth account
metadata records the fingerprint so an existing dataset cannot be reused with
different generation settings or assets by accident. To reproduce a run, retain
the generator version, image files, random seed, and reference date.

The plan checks active categories, the photo bucket, the migrated public view,
account ownership, and existing records. It reports missing records without
writing to Supabase. Apply requires an explicit target matching the configured
HTTPS project URL. Seeding is never part of Vercel builds or schema migrations.

### Passwords and reruns

On the first apply, the runner creates a random demo password and stores it in
`~/.local/share/kamoti/demo-seeds/credentials-<PROJECT_REF>.json` with mode `0600`.
The parent directory must enforce mode `0700`; the runner refuses filesystems
that do not preserve these permissions. That file lists the account emails and
roles, outside the repository. The `.seed/` directory is ignored by Git. Keep the
file private, particularly the administrator login. The script never prints
passwords or tokens. Optionally set `DEMO_PASSWORD` privately before first apply;
it must be 16–72 characters. Existing account passwords are never reset.

Auth users are created through the admin API with confirmed synthetic emails.
Profiles, reports, history, notifications, and image links are inserted in
dependency order. Existing rows are skipped. Activity records use the explicit
`demo.report_seeded` action rather than claiming real staff work occurred.
Database reference codes are allocated by the existing trigger.

Auth, Storage, and database writes do not share one transaction. If a run fails,
keep the same manifest, assets, credentials, and code version, then rerun plan
and apply. Stable record IDs let the command insert missing records without
reverting report status, read notifications, or edited text. The script does not
delete records or provide a reset command. A partial run can be visible until
the retry finishes.

Use one operator at a time. A `.seed/<PROJECT_REF>.lock` file prevents concurrent
apply runs from this checkout; it does not coordinate separate computers. After
a killed process, confirm it has stopped before manually removing its stale
lock. Apply hashes existing application rows before and after the run and fails
if any changed. Avoid simultaneous demo interactions during this check because
they can change the same rows legitimately.

### Verification and images

`seed:verify` checks record completeness, public visibility, resolution dates,
and stored image bytes. It allows later report edits and does not restore initial
states. Also run `bun run test:smoke` and inspect the board filters, report
timelines, staff queues, and citizen notifications on the deployed site.

The PNG assets are checked in under `scripts/demo/assets/`. To regenerate the
illustrations, use `bun run seed:assets` with Playwright Chromium installed.
Regenerated bytes can change the fingerprint; retain the original assets when
resuming an existing dataset. The normal seed commands do not need Chromium.
