# KAMOTI

KAMOTI lets citizens report damaged public infrastructure and track progress.
The current application includes a public transparency board, Citizen report
submission and tracking, a Staff workspace, and Administrator management
screens. The public board shows reviewed reports without citizen details.

## Stack and layout

One root Bun package contains a React + Vite + TypeScript frontend in
`src/web/` and an Express + TypeScript API in `src/server/`. Node.js runs
the API. Supabase provides PostgreSQL, Auth, and Storage. The intended
deployment is one Vercel project for the site and API.

## Run locally

The [local-development guide](docs/LOCAL_DEV.md) owns prerequisites,
environment safety, Supabase preparation, all available commands, and required
verification. Once the environment is ready, the shortest start path is:

```bash
bun install
cp .env.example .env
# Fill in the Supabase URL and keys in .env.
bun run dev
```

Open `http://localhost:5173`.

See the [frontend guide](docs/FRONTEND.md) for routes, role access, and page
behavior. The [documentation index](docs/INDEX.md) routes all other project
information to its authoritative document.

## Working together

Use GitHub Issues to track work and separate branches or worktrees for parallel
changes. Read [CONTRIBUTING.md](CONTRIBUTING.md) for ownership and the pull
request workflow. Before opening a PR, validate the linked issue's completion
criteria and record the results in the [PR template](.github/pull_request_template.md).
CI runs `bun run typecheck`, `bun run test`, and `bun run build` on PRs and
pushes to `main`. The [local-development guide](docs/LOCAL_DEV.md#run-and-verify)
explains those checks, and [its test suites section](docs/LOCAL_DEV.md#test-suites)
explains what each suite needs.
