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
| Database access | `psql` command below | A disposable database with every migration applied |
| Browser and manual | No command yet | A running app, and the synthetic fixture for evidence work |

The fast suite lives in `tests/fast/` and covers logic that can be checked on
its own: no database, no running server, no browser, and no test runner beyond
the one built into Bun. CI runs it on every pull request next to
`bun run typecheck` and `bun run build`. Keep that boundary — a test that needs
a database, a deployed site, or a browser belongs in another suite, not in
`tests/fast/`. Those files are not covered by `bun run typecheck`, because the
typecheck projects compile application sources only.

The database suite verifies access boundaries on a disposable database after
applying all migrations:

```bash
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/api_access.sql
```

It creates synthetic records inside a transaction and rolls them back. Do not
run it against a database that is not approved for testing.

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
is the only bundled fixture, it is limited to local development, and it is safe
to rerun. Until you run it, create test records manually and follow the safety
boundaries above.

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
   input). Choose any password at runtime; never commit, share, or document a
   real one. The command never stores the password in the repository, prints
   it, or logs it. For scripted runs, pipe the confirmation phrase and the
   password into stdin, one line each. Piped values are trimmed, so type the
   password interactively instead when it must start or end with a space.

### Expected aliases and report states

Accounts. Aliases are stable and use the reserved `.invalid` domain:

| Alias | Role |
| :--- | :--- |
| `fixture-admin@kamoti.invalid` | Administrator |
| `fixture-citizen-1@kamoti.invalid` | Citizen, owns two fixture reports |
| `fixture-citizen-2@kamoti.invalid` | Citizen, owns one fixture report |
| `fixture-staff-1@kamoti.invalid` | Staff, has one fixture report assigned |
| `fixture-staff-2@kamoti.invalid` | Staff, has no assignment |

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
