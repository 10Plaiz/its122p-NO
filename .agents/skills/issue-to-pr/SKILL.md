---
name: issue-to-pr
description: Drive one GitHub issue through implementation, review, focused commits, and a template-filled pull request. Use when the user asks to take an issue to a pull request or explicitly requests the full issue-to-PR workflow.
---

<!-- Mirror of .claude/skills/issue-to-pr/SKILL.md (canonical). Edit the
canonical file, then re-copy this mirror so the two stay identical. This
mirror exists because Antigravity and Codex scan .agents/skills/ while
Claude Code scans .claude/skills/. -->

# Issue to Pull Request Pipeline

Take one GitHub issue from agreed scope to an opened pull request. Adapt the
setup and verification to the repository. Keep evidence for each acceptance
criterion, preserve the issue boundary, and stop after the pull request opens.

## Entry Point

Start at the earliest incomplete stage:

- Before implementation: start at stage 1.
- After implementation: confirm the agreed scope and import only preserved
  command results into the evidence ledger, then start at stage 3.
- After review and commit: confirm the commits and evidence, then start at
  stage 4.

## Approval Boundaries

Before every mutating Git command, show the exact command and its impact. Get
explicit user approval immediately before execution. An earlier request to
edit code, approve a plan, or select review findings is not Git approval.

Pull request creation is a separate external write. Show the exact
`gh pr create` command and its impact, and get explicit approval before it
runs. One prompt can request approval for both push and pull request creation
when it shows both exact commands. If the user approves only the push, stop
before creating the pull request.

## Evidence Ledger

Keep one secret-free evidence ledger from stage 2 onward. Each entry links an
acceptance criterion or material claim to the command or inspection and its
verifiable result. For work that started before this skill, import evidence
only from preserved output or logs. Never infer or fabricate a result.

## Stage 1: Route and Set Up

1. Read the issue in full with `gh issue view <number>`. Extract the outcome,
   acceptance criteria, change boundary, and out-of-scope behavior.
2. Read the repository documents that own contribution, setup, verification,
   and area-specific rules. Do not load unrelated history as authority.
3. Explore the affected code, contracts, and configuration.
4. Present the intended outcome, implementation plan, expected file list, and
   two setup choices: a feature branch in the current workspace or a feature
   branch in a separate worktree. Ask the user to select one. Treat the file
   list as an estimate, not a whitelist. Necessary tests, documentation, and
   configuration can remain in scope when they support the agreed outcome.
   Stop and align if behavior must expand.
5. Apply the approval boundary to the exact command for the selected setup,
   then create or switch to the feature branch or create the worktree. Confirm
   the result with `git status --short --branch` from the selected workspace.
6. Do not install dependencies, edit source files, or run verification before
   the selected branch or worktree is ready. After it is ready, perform all
   remaining stages from that workspace. Follow the repository's setup guide
   for dependencies and ignored environment files. Never print secret values.

Completion criterion: the user has agreed to the scope and plan, explicitly
selected a branch or worktree, and the selected workspace is ready under the
repository's setup rules. No dependency installation, source edit, or
verification has run before setup completed.

## Stage 2: Implement and Verify

1. Implement only the agreed outcome. Stop and align if new behavior falls
   outside the issue boundary.
2. Verify incrementally. Run the smallest relevant check first, then the
   broader repository checks. Get approval before state-changing runs against
   shared or deployed targets.
3. Check that the verification commands cover all new or changed files. Close
   a coverage gap with the narrowest relevant direct check.
4. Add each material result, failure, and remaining limitation to the evidence
   ledger.

Completion criterion: every acceptance criterion is implemented and mapped to
evidence, and every known verification limitation is recorded.

## Stage 3: Review and Commit

1. Diff the real worktree against the base branch. Review the diff, not a
   summary.
2. Present one pre-commit review containing:
   - The changed files checked against the issue boundary
   - The acceptance criteria and their evidence
   - The resulting behavior or state
   - Failures that occurred and how they were resolved
   - Remaining limitations and their reasons
   - The findings table below

   | Tier | Finding ID | Area / File | Current state | Proposed improvement | Net complexity impact |
   | :--- | :--- | :--- | :--- | :--- | :--- |

   Use Tier 1 for self-contained, low-risk polish. Use Tier 2 for blockers or
   major risks such as scope violations, credential exposure, authorization
   bypasses, and broken invariants.
3. Stop for the user to accept the report and select findings. Do not apply
   findings before selection. Never patch a Tier 2 finding silently.
4. Apply only the selected findings. Re-run the narrow checks, then the
   relevant repository checks. Review the final diff.
5. Plan focused commits that follow the repository's message conventions.
   Stage explicit paths; never use `git add .`. Apply the approval boundary to
   the exact add and commit commands before execution.

Completion criterion: the accepted findings are resolved, required checks
pass or have an explicit external limitation, the work is in focused commits,
and `git status --short` is clean.

## Stage 4: Ship and Stop

1. Confirm the worktree is clean, every intended change is committed, and
   every acceptance criterion has evidence.
2. Read the pull request template at runtime and prepare every applicable
   section. Preserve its headings and structure. Link the issue with
   `Closes #N` when the pull request completes it. Tick only true checkboxes,
   explain checks that could not run, use relative file paths, and omit
   secrets.
3. Present the exact push and pull request creation commands. Apply the approval
   boundary before either action.
4. Push the branch and create the pull request against the default branch with
   the prepared template content.
5. Verify that the pull request is open, the issue link is present, the
   template sections render, and required checks pass. Report an external or
   permission failure with its exact reason; do not describe it as passing.
6. Report the pull request URL and stop. Do not merge or begin follow-on work.

Completion criterion: the pull request URL is reported, its issue link and
template content are confirmed, and execution has stopped.
