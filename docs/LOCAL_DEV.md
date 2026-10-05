# Local development

This guide owns local prerequisites, environment setup, development commands,
and safety boundaries. Use [API.md](API.md) for endpoint contracts and the
reviewed database migration procedure.

## Prerequisites

- Bun 1.4 or newer
- Node.js 22 or newer
- An approved Supabase development target, hosted or local
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

Use the team's approved target, or create a fresh development project before
linking. A new hosted project is not required for each worktree. Worktrees that
use one project share its data and Auth settings. Use separate frontend and API
ports for parallel development, and confirm the API proxy points to that worktree.
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
| `VITE_GOOGLE_MAPS_API_KEY` | Browser Maps key, restricted to approved referrers and Maps APIs |
| `VITE_GOOGLE_MAPS_MAP_ID` | Optional map ID; development defaults to `DEMO_MAP_ID` |

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
| `bun run test:submission-limits` | Verify shared quotas through local Supabase and independent API processes |
| `bun run test:submission-browser` | Verify quota errors and form state in Chromium against local servers |
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
| Submission limits | `bun run test:submission-limits` | An exclusive local Supabase CLI stack with all migrations and the disposable marker |
| Submission browser | `bun run test:submission-browser` | The same local stack, running API and Vite servers, and Playwright Chromium |
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
accounts or reports. Tokens and credentials are suppressed from logs. Its cleanup
deletes synthetic data. Do not run this suite against a shared project where
deletion is prohibited. A read-only or record-retaining release check must
preserve its assertions and record its differences from this suite.

### Verify submission limits with an isolated local stack

Create a separate Supabase CLI workdir for these tests. Copy this repository's
`supabase/config.toml`, `supabase/migrations/`, and `supabase/templates/` into
its `supabase/` directory. Give the copy its own `project_id` and unused ports
before starting it. Do not run these tests in a worktree that shares another
local Supabase project's `project_id` or ports.

For issue #60, the isolated CLI project used `project_id = "kamoti-issue-60"`,
API port `54461`, and database port `54462`. Its shadow, Studio, Mailpit,
analytics, and pooler ports used `54460`, `54463`, `54464`, `54467`, and
`54469`; the edge inspector used `55468`. The repository's default project is
`kamoti` with API port `54321` and database port `54322`. If those or another
stack are running, keep every configured listener separate. The issue #60
stack started with Studio, Realtime, edge runtime, Logflare, Vector,
Supavisor, and postgres-meta excluded. Keep Auth, the Data API, PostgreSQL,
and Storage available to the tests.

Start the isolated stack with the Supabase CLI from the environment that can
access Docker. `supabase start` applies the copied migrations:

```bash
bunx supabase start --workdir "$LOCAL_SUPABASE_WORKDIR" \
  --exclude studio,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta
bunx supabase migration list --local --workdir "$LOCAL_SUPABASE_WORKDIR"
```

Confirm that the local migration list matches the copied SQL files. The issue #60
copy contained all 19 migration files, including
`20261005000100_citizen_submission_limits.sql`. Run the repository migrations
through the CLI; an ad hoc bootstrap schema does not verify migration replay.
Run `bunx supabase status --workdir "$LOCAL_SUPABASE_WORKDIR"` to obtain the
API URL, local keys, and database URL. Keep those values in an
ignored local environment file or process environment. Do not paste status
output into an issue or PR because it contains credentials.

The SQL and both runtime suites require `kamoti.test_database = 'disposable'` on
new connections. Set this database-level marker only on the confirmed local
CLI database, as `supabase_admin`. For the issue #60 container, the command
run from a shell with Docker access is:

```bash
printf '%s\n' "alter database postgres set kamoti.test_database = 'disposable';" |
  docker exec -i supabase_db_kamoti-issue-60 \
    psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres
```

Set `TEST_DATABASE_URL` to that local database's `postgres` owner connection.
Confirm that its host is `127.0.0.1` or `localhost`. Then check the marker:

```bash
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "select current_setting('kamoti.test_database', true);"
```

The result must be `disposable`. Never set this marker on a shared or hosted
database. The marker is a guard, not permission to modify another project.

The database suite verifies access boundaries and submission limits on this
disposable database after all migrations are applied:

```bash
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/api_access.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/database/atomic-actions.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/database/submission-limits.sql
```

It creates synthetic records inside a transaction and rolls them back. Do not
run it against a database that is not approved for testing. `atomic-actions.sql`
injects failures to check rollback of closure and privileged account operations.
It requires a disposable database with `kamoti.test_database = 'disposable'`.
Do not enable that setting or install its failure triggers on the shared project.
Native PostgreSQL replay verifies SQL behavior; it does not run Supabase Auth,
Storage file handling, or email delivery. The submission limits SQL test uses
the actual admission RPC and rolls back its synthetic rows.

Run the live quota suite from the repository root with `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `TEST_DATABASE_URL` set
to this one local stack:

```bash
bun run test:submission-limits
```

The runner refuses non-local API and database addresses and checks the
disposable marker before creating data. It requires exclusive use of the local
stack because it creates Auth users, reports, photos, proofs, Storage objects,
and notifications. It starts two independent Node API processes on ports
`56400` and `56401` by default; `SUBMISSION_TEST_PORT` changes the first port
and reserves the next one. It retains its synthetic records under a unique run
ID. During one failure check, it temporarily revokes the service role's
execute privilege on the admission function and restores it in `finally`.
Run no other application or test against this stack during the suite.

For the browser check, start the API on `4000` and Vite on `5173` with the
same local Supabase values and a working browser Maps key. Install Chromium
before starting the servers:

```bash
bunx playwright install chromium
bun run dev
```

After `bun run dev` is ready, run this command in a second terminal:

```bash
bun run test:submission-browser
```

`PLAYWRIGHT_BASE_URL` defaults to `http://localhost:5173` and must point to a
local app. The browser suite checks the disposable marker, requires exclusive
use of this stack, and retains its synthetic records. It checks actual `429`
and `503` responses, manual retry, and retained form state in Chromium. It
temporarily revokes the admission RPC's execute privilege for the `503` check
and restores it in `finally`. Screenshots go to
`tests/evidence/submission-limits-2026-10-05/` by default; `EVIDENCE_DIR`
changes the parent directory.

The browser automation suite lives in `tests/browser/` and runs Playwright
tests against Chromium. It exercises citizen report submission, editing,
cancellation, staff queue transitions, remarks, admin metrics, and multi-viewport
responsive layouts across mobile (375x812), tablet (768x1024), and desktop (1280x800).
It captures full-page evidence screenshots to `tests/evidence/`, or to the folder
named by `EVIDENCE_DIR`. The Phase 4 report cites the set in
`tests/evidence-deployed/`, captured against the deployed site.

```bash
bunx playwright install chromium
bun run test:browser
```

Browser runs retain their records by default. Cleanup requires
`KAMOTI_TEST_CLEANUP_TARGET` to equal the approved disposable Supabase hostname,
as well as a working secret key and all fixture accounts. It deletes `[TEST]`
reports and a fixed staff remark only when fixture-owned, and retains rated
reports. A fixture account's presence does not make a shared project disposable.
Keep the cleanup variable unset for shared release verification. Do not run
`bun run test:cleanup` there.

Configuration and runtime parameters:
- `PLAYWRIGHT_BASE_URL`: Site under test (defaults to `http://localhost:5173`, so start
  `bun run dev` first). Set it to `https://kamoti-chi.vercel.app` to test the deployed site.
- `EVIDENCE_DIR`: Folder for evidence screenshots (defaults to `tests/evidence`).
- `FIXTURE_PASSWORD`: Fixture account password (defaults to `Password123!`).
- `SESSION_TEST_EMAIL` and `SESSION_TEST_PASSWORD`: Optional synthetic Citizen
  account for the independent refresh and idle/draft tests. Otherwise they use
  Citizen 1. Keep real recipient addresses and passwords outside Git.

The account-code suite also needs a local Supabase Auth service and Mailpit.
It skips those cases when Mailpit is unavailable. A native PostgreSQL instance
does not supply Mailpit. Record hosted email tests separately and do not count
skips as passes.

Reporting tests also require their synthetic Citizen accounts to have uploaded
proof or an explicit Administrator residency review. The account-code tests
start with locked Citizens and test that process themselves. After applying an
accounts migration to older fixtures, check these preconditions before running
reporting tests. Prepare only the affected synthetic accounts through the
application. Do not reset all fixture passwords or reseed the shared project.

## Hosted account configuration

Match the account settings and templates in
[API.md](API.md#how-authentication-works). Local `supabase/config.toml` is not a
safe replacement for the entire hosted Auth configuration. Apply only the
reviewed settings. Preserve the production site URL, redirect allow-list, keys,
and unrelated provider settings.

Supabase Auth creates and checks signup and recovery codes. SMTP delivers them.
Free projects using the default sender cannot always customize templates; new
projects after 3 June 2026 require custom SMTP. The default sender also restricts
delivery to organization members and two emails per hour. An owner test email
alone does not make arbitrary-user signup ready. See the
[official SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).

Before claiming account readiness, use an approved real recipient to check
delivery, wrong codes, correct codes, reuse, sign-in, recovery, old and new
passwords, and old-session access. Enter codes in the local application. Keep
email addresses, codes, and tokens out of committed evidence and logs.

Test case identifiers, results, evidence, and defects belong in the
[Phase 4 test report](Phase4_Test_Report.md), not in this guide.

## Safety boundaries

- Never commit `.env`, Supabase keys, access tokens, database passwords, or
  real personal information. The disposable presentation-account password for
  the shared test project is documented in [TEST_ENVIRONMENT.md](TEST_ENVIRONMENT.md#presentation-logins).
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

Do not remove or reset the fixture during a shared release. Integration migrations
replace deletion cascades with restrictions, and feedback is immutable. The old
report-first deletion recipe is no longer a valid general cleanup procedure.
Use a separately approved disposable target for destructive test teardown.

## Makati demo seed

The presentation dataset is separate from the five fixture accounts above.
It creates 30 demo citizens, five staff, one administrator, and 150 reports
across the six standard categories. The reports cover six months up to a fixed
reference date. Report titles, descriptions, addresses, account display names,
history, and notifications read like ordinary reports. The accounts retain
`demo-makati-*@kamoti.invalid` addresses, and activity logs retain the dataset
marker. Locations and incidents are illustrative, not verified public reports.

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

For manual staff, admin, and citizen walkthroughs, use the
[presentation login table](TEST_ENVIRONMENT.md#presentation-logins). In particular,
`demo-makati-staff-1@kamoti.invalid` has 50 assigned reports in the initial
seed; `fixture-staff-1@kamoti.invalid` has only one `[FIXTURE]` report. Sign in
with the presentation password in that table.

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
file private for other projects. The shared test project's disposable
presentation password is recorded in [TEST_ENVIRONMENT.md](TEST_ENVIRONMENT.md#presentation-logins).
The script never prints passwords or tokens. Optionally set `DEMO_PASSWORD`
privately before first apply;
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

### Refresh copy in the existing presentation seed

PR 43 already inserted the original wording into the linked project. Editing
`generate_seed.ts` and regenerating the manifest does not update those rows.
The runner preserves existing rows and rejects a changed manifest fingerprint.
Do not rerun `seed:apply` or `seed:verify` with the revised generator against
the PR 43 dataset.

The one-time [copy refresh SQL](../scripts/demo/refresh_seed_copy.sql) selects
only accounts with the `makati-demo-v1` Auth marker and reports with the
`demo.report_seeded` audit marker. It checks for 36 accounts and 150 reports
before changing text. It updates original demo wording in names, reports,
history, and notifications. It also updates the exact original title and
description of three older cancelled demo reports found outside the seed.
Edited values and other records are left alone. Review the target
and confirm marker counts with these read-only queries in the linked Supabase
project's SQL editor:

```sql
select count(distinct entity_id) from activity_logs
where action = 'demo.report_seeded' and metadata->>'dataset' = 'makati-demo-v1';
select count(*) from auth.users
where raw_app_meta_data->>'demo_dataset' = 'makati-demo-v1';
```

After taking a database backup, run the refresh SQL once in that SQL editor.
Its transaction rolls back on an error. Check a sample of public board cards,
timelines, and notifications afterward. The PNG illustrations still carry their
visible illustration labels.

### Verification and images

`seed:verify` checks record completeness, public visibility, resolution dates,
and stored image bytes. It allows later report edits and does not restore initial
states. Also run `bun run test:smoke` and inspect the board filters, report
timelines, staff queues, and citizen notifications on the deployed site.

The PNG assets are checked in under `scripts/demo/assets/`. To regenerate the
illustrations, use `bun run seed:assets` with Playwright Chromium installed.
Regenerated bytes can change the fingerprint; retain the original assets when
resuming an existing dataset. The normal seed commands do not need Chromium.
