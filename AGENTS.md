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
- For database or API work, follow the migration and access guidance in the
  [API guide](docs/API.md). Keep credentials out of repository files and PRs.
- Before opening a PR, use the [PR template](.github/pull_request_template.md)
  to validate every completion criterion in its linked issue, when there is
  one. Run the relevant checks from [README.md](README.md) and report results.
- For local browser testing, capturing visual evidence, or validating UI edge cases, use the project skill `/verify-kamoti` located in `.agents/skills/verify-kamoti/`.
