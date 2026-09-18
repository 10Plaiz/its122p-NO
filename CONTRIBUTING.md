# Contributing

Read this before changing the repository or opening a pull request.

## Setup

Use Bun for package management and Node.js for the Express API. From the
repository root:

```sh
bun install
cp .env.example .env
# Fill in the Supabase URL, publishable key, and secret key privately.
bun run dev
```

Run the checks used by CI before opening a pull request:

```sh
bun run typecheck
bun run build
```

The full local setup and API checks are documented in the [API guide](docs/API.md).

## Who owns what

Ownership identifies the first reviewer for an area. It does not prevent a
necessary cross-area change.

| Area | Primary responsibility |
| :--- | :--- |
| Frontend | React components, pages, styles, and browser interaction in `src/web/` |
| API | Express routes, middleware, services, and server configuration in `src/server/` |
| Database | SQL migrations, access rules, and Supabase setup in `supabase/` |
| Documentation | README, guides, architecture, API, and contribution workflow |

Call out changes to API responses, database tables, environment variables, or
other shared contracts in the pull request. Ask the affected owner to review
those changes.

## Supabase environment

The application uses these local values:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

The publishable key replaces the legacy `anon` key for this project. The secret
key is required by the local Express API and must remain server-only. Share it
only with trusted teammates through a private channel. Never commit `.env`,
place a secret in a `VITE_*` variable, or include credentials in an issue or
pull request.

The database password and Supabase CLI access token are separate credentials.
Keep them with the designated migration owner rather than sharing them with
the whole team.

## Database and migrations

Any contributor may propose a migration in a feature branch. Do not apply a
feature-branch migration to the shared Supabase project.

After the migration pull request is merged, the designated migration owner:

1. Reviews the merged SQL.
2. Runs `bunx supabase db push --dry-run`.
3. Confirms that only the intended migrations are listed.
4. Runs `bunx supabase db push --skip-vault`.
5. Runs `bunx supabase migration list` and records the result in the handoff
   or pull request when useful.

CI does not receive Supabase secrets and never runs `supabase db push`.
See the [API guide](docs/API.md#database-migrations) for the command details.

## Branches, commits, and pull requests

- Work from a separate branch so frontend and API work can proceed in parallel.
- Use a short, descriptive branch name. A conventional prefix is optional.
- Keep each commit focused on one logical change.
- Link the relevant GitHub Issue with `Closes #...`, `Part of #...`, or
  `Depends on #...`.
- Complete every applicable section of the [pull request template](.github/pull_request_template.md).
- Validate every completion criterion in the linked issue before opening the
  pull request. Report the result and evidence for each criterion.
- Describe shared API, database, environment, or architecture changes clearly.
- Include screenshots or other visual evidence for visible frontend changes.
- Explain any check that could not run and any remaining limitation.

Branch protection is not enabled yet. Use pull requests and CI as the team
review gate while the repository is small.

## Source of truth

- [README.md](README.md) is the quick-start and collaboration entry point.
- [docs/INDEX.md](docs/INDEX.md) maps the project documentation.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) owns module boundaries.
- [docs/API.md](docs/API.md) owns the API and Supabase workflow.
- The proposal and course documents define intended behavior and required
  deliverables. Source code and migrations show what is implemented.

When these sources disagree, report the mismatch in the pull request or issue;
do not silently rewrite one source to match another.

## Boundaries

- Use synthetic data for development and evidence.
- Never commit secrets or real personal information.
- Do not treat browser-side visibility as authorization.
