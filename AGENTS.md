# Repository task guide

Start with [README.md](README.md). Use [docs/INDEX.md](docs/INDEX.md) to find
only the documents relevant to the task.

- The [course guide](docs/Guide.md) and the
  [Phase 3 and Phase 4 instructions](docs/Phase_Instructions.md) own requirements,
  deliverables, and evidence. A later instructor clarification lets the team
  choose its technology stack; PHP, MySQL, and other stack examples in those
  handouts are not mandatory.
- Follow the current team choices in [README.md](README.md),
  [architecture](docs/ARCHITECTURE.md), and [API guide](docs/API.md) until the
  team agrees to change them. Do not infer a stack change from a handout example.
- The [proposal](docs/Final_Project.md) owns intended behavior. Source code and
  SQL migrations show what is implemented. Report a mismatch rather than
  silently treating either as the other.
- For database or API work, follow the migration, access, and deployment-order
  guidance in the [API guide](docs/API.md). Keep credentials out of repository
  files and PRs.
- Before running a test, seed, or cleanup that writes data, confirm its target
  in the [local-development guide](docs/LOCAL_DEV.md#test-suites). Suites that
  delete records or inject failures run only against a local database marked
  `kamoti.test_database = 'disposable'`, never the shared Supabase project.
- For UI or visual changes, follow the [design system](design.md) and the
  project skill `/ui-improvements` in `.agents/skills/ui-improvements/`.
- For local browser testing, visual evidence, or UI edge cases, use the project
  skill `/verify-kamoti` in `.agents/skills/verify-kamoti/`.
- Validate every completion criterion in the linked issue, when there is one,
  and run the relevant checks from [README.md](README.md). Report the results.
- When a change completes or alters a requirement, update its Status in
  [IMPROVEMENT_REQUIREMENTS.md](docs/updates/IMPROVEMENT_REQUIREMENTS.md). When
  it changes a permission, a security control, or an accepted risk, update the
  [permissions table](docs/API.md#roles-and-permissions) or
  [SECURITY.md](docs/SECURITY.md). Track open work in GitHub Issues, not in
  repository planning files.
- The team allows a direct push to `main` when all of these hold:
  - the new commits apply to the current `origin/main` as a fast-forward, with
    no merge conflicts;
  - `bun run typecheck`, `bun run test`, and `bun run build` pass;
  - the change needs no unapplied shared-database migration.

  Otherwise open a PR and complete the
  [PR template](.github/pull_request_template.md). Every push to `main`
  redeploys the live site.
