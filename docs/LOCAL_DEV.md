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
| `bun run build` | Compile the API and build the web application |
| `bun run start` | Run the compiled API with Node.js |

Open `http://localhost:5173`. Vite forwards `/api/*` to the local Express
server. A basic API check is available at `http://localhost:4000/api/health`.

To verify database access boundaries on a disposable database after applying
all migrations:

```bash
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/api_access.sql
```

The SQL test creates synthetic records inside a transaction and rolls them
back. Do not run it against a database that is not approved for testing.

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

This section is the canonical home for the safe fixture command, expected
accounts and reports, rerun behavior, and reset boundary. A fixture added to the
repository must be explicitly limited to local development, use recognizable
synthetic data, be safe to rerun, and leave ordinary records untouched. Until
such a fixture exists, create test records manually and follow the same safety
boundaries.
