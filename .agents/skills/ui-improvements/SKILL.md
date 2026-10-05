---
name: ui-improvements
description: "UI improvements: Use this skill when the user asks to improve KAMOTI's existing UI or UX, verify the changes, and finish with split-commit."
---

# UI improvements

Improve the agreed user flow. Keep this workflow limited to inspection,
implementation, verification, and focused commits.

## Boundaries

| Rule domain | Requirement | Rationale |
| :--- | :--- | :--- |
| Scope | Change frontend code and directly related tests or documentation. Report backend, API, database, or shared contract dependencies as separate work. | Keep UI work within the agreed boundary. |
| Delivery | When a PR is requested, confirm its destination and inspect the intended head/base diff. | A worktree's starting branch does not establish the delivery target. |

## Workflow

### 1. Inspect the affected UI

- Start with [README](../../../README.md) and the [documentation index](../../../docs/INDEX.md). Read only the owners relevant to the task.
- Confirm the active worktree and UI/API endpoints. Use `$design-thinking` with the established decisions in [design.md](../../../design.md).
- Use `rg` to locate existing tokens, components, and their callers. Exercise the affected flow with [verify-kamoti](../verify-kamoti/SKILL.md) before judging its behavior.

**Done:** The current behavior is observed, the intended result is clear, and the affected callers are identified.

### 2. Implement the agreed improvement

- Reuse the design system and existing primitives. Add a shared primitive when it removes meaningful duplication across identified callers.
- Implement one coherent user-visible change at a time. Check other consumers when changing shared styles, components, or behavior.

**Done:** The requested behavior is implemented across the identified callers.

### 3. Verify and curate

- Exercise the changed flow and its relevant keyboard, responsive, loading, empty, and failure states using the project verification recipes.
- Run the relevant checks from [local development](../../../docs/LOCAL_DEV.md#run-and-verify). Record actual results and any roles or cases that could not be exercised.
- Retain concise reports and selected screenshots. Keep raw dumps and intermediate captures in ignored local storage.
- Inspect the complete proposed diff and new files for scope and excessive generated evidence before committing.

**Done:** The agreed UI behavior is verified, coverage limits are stated, and the retained files support review.

### 4. Finish with split-commit

- Read and apply the available `$split-commit` skill to the verified, curated changes. Pass along the existing check results. Commit within the task's authorization.
- If publishing is requested, follow [CONTRIBUTING](../../../CONTRIBUTING.md) and the [PR template](../../../.github/pull_request_template.md).

**Done:** The owned changes are committed when authorized, or an ordered commit plan is provided when commits were not requested. Report verification results and remaining limits.

## Gotchas

Observed during this project's UI work:

- At a 320px viewport, Admin Reports and Admin Users expanded to 859px and 797px. Browser inspection exposed the overflow ([audit report](../../../tests/evidence/hallmark-design-system-2026-10-04/report.md)).
- Five raw `observations.json` dumps added 210,645 lines to the original UI PR. Curate evidence before the first commit; deleting files later does not remove them from earlier commits.
- [PR #57](https://github.com/10Plaiz/its122p-NO/pull/57) merged into `improve/integration`; [PR #58](https://github.com/10Plaiz/its122p-NO/pull/58) was then opened for `main`. Confirm the intended destination before creating a PR.
