# KAMOTI

KAMOTI lets citizens report damaged public infrastructure and track progress.
Staff work on assigned reports, administrators manage the system, and the
public board shows reviewed reports without citizen details.

## Stack and layout

One root Bun package contains a React + Vite + TypeScript frontend in
`src/web/` and an Express + TypeScript API in `src/server/`. Node.js runs
the API. Supabase provides PostgreSQL, Auth, and Storage. The intended
deployment is one Vercel project for the site and API.

## Run locally

Install Bun 1.4+ and Node.js 22+, then from the repository root:

```bash
bun install
cp .env.example .env
# Fill in the Supabase URL and keys in .env.
bun run dev
```

Open `http://localhost:5173`. Vite forwards `/api/*` requests to the
Express server on port 4000. Before using data routes, apply the Supabase
migrations to the linked project as described in the [API guide](docs/API.md#setup).

| Command | Purpose |
| :--- | :--- |
| `bun run dev` | Start web and API together |
| `bun run typecheck` | Check web, API, and Vercel entry types |
| `bun run build` | Compile the API and build the web app |
| `bun run start` | Run the compiled API with Node.js |

The web app is a small starter. Phase 3 screens are still to be built.
See the [documentation index](docs/INDEX.md) for the proposal, architecture,
API reference, and course instructions.

## Working together

Use GitHub Issues to track work and separate branches for parallel changes.
Read [CONTRIBUTING.md](CONTRIBUTING.md) for ownership, environment safety,
migration responsibility, and the pull request workflow. Before opening a PR,
validate the linked issue's completion criteria and record the results in the
[PR template](.github/pull_request_template.md). CI runs the typecheck and
build commands above on PRs and pushes to `main`; add a test step when the
project has an automated test script.
