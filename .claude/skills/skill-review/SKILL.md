---
name: skill-review
description: A repeatable process for evaluating and integrating new skills discovered online.
---

# Skill Review & Optimization Workflow

A repeatable process for evaluating and integrating new skills discovered online.

## The Process

### 1. Source & Intake (User)
- Find a skill online (e.g., skills.sh, GitHub, forums).
- Read it first—filter out obvious noise.
- Add the raw file to `experiment/` for review.

### 2. Analysis & Plan (AI)
- Read the skill file in full.
- Compare against existing skills to find overlaps and gaps.
- Produce an **implementation plan** covering:
  - **What it does** — what problem does this skill solve?
  - **What to keep** — rules that are general-purpose and AI-agnostic.
  - **What to cut** — tool-specific instructions, prose, verbose preamble.
  - **Where it lives** — new file vs. merged into existing skill.
  - **User Review Required** — breaking decisions that need a sign-off.
  - **Verification Plan** — how to confirm quality is preserved.

### 3. User Review & Approval
- Review the plan summary before any code changes are made.
- Approve, reject, or modify the plan.

### 4. Execute
- Rewrite/create the skill file with the lean, dense format.
- No prose—bullet points, rules, and formulas only.
- Keep accuracy and quality; ruthlessly cut everything else.
- Move the original file to `archives/` (never delete—gitignored for safety).

### 5. Post-Execution Check
- Verify the skill is still accurate and can pass its `evals/` tests if present.
- Check if there are further optimizations without sacrificing quality.

---

## Lean Skill Design Principles

These apply to every skill file in this repo:
- **One job per file:** Design is separate from Engineering, which is separate from Copywriting.
- **Generative over Evaluative:** Constraints are applied *during* generation, not *after*.
- **Rules, not prose:** Bullet points and formulas over paragraphs.
- **No scatter:** Consolidate multi-file references into a single dense `SKILL.md`; avoid making the AI bounce between files.
- **Never fabricate:** If data (testimonials, stats) doesn't exist, mark the section as optional.
