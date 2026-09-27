# Contributing

Read this before changing the repository or opening a pull request.

## Setup

Follow the [local-development guide](docs/LOCAL_DEV.md) for prerequisites,
environment setup, safety boundaries, and verification commands. API and
database-specific checks are documented in the [API guide](docs/API.md).

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

## Database and migrations

Any contributor may propose migration SQL in a feature branch. Reviewers and
the designated migration owner follow the workflow in
[API.md](docs/API.md#database-migrations). Record relevant migration evidence in
the pull request.

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
- Include screenshots or other visual evidence for visible frontend changes. Use the `/verify-kamoti` skill (`bun run test:browser`) to capture evidence into `tests/evidence/`.
- Explain any check that could not run and any remaining limitation.

Branch protection is not enabled yet. Use pull requests and CI as the team
review gate while the repository is small.

## Where information belongs

The [documentation index](docs/INDEX.md) identifies the owner of each durable
project fact. GitHub Issues own current work, priority, and blockers. Pull
requests own implementation and verification evidence.

Source code, migrations, and tests show what is implemented. When an owner
document and implementation disagree, report the mismatch in the pull request
or issue rather than silently treating one as the other. Do not copy durable
facts into secondary documents; link to their owner instead.
