---
name: project-planning
description: Standards and templates for generating highly structured, pragmatic, and technology-agnostic project plans.
---

# Project Plan Architecture & Design Standard

A standard process and template for generating clear, balanced, and actionable project plans in team software projects. Use this standard to audit requirements, design directory/module boundaries, map data architectures, and establish clear timelines.

---

## 1. Plan Structure Template

Project plan documents should follow this modular structure, choosing sections relevant to the scope:

### 1.1. Glossary
- Define all ambiguous terms, conventions, or domain-specific concepts up front.
- Use a markdown table for alignment.

### 1.2. Requirement & Gap Audit
- Identify any "homeless" features by cross-referencing functional requirements against the existing codebase structure.
- List: Feature name | Requirement Ref | Status (Homeless / Scaffolding / Existing) | Action/Owner.

### 1.3. Interface & API Catalog
- Catalog every distinct user interface screen, routing entry, or API endpoint needed.
- Categorize by weight/complexity: `FE` (Frontend-heavy), `BE` (Backend-heavy), or `BOTH`.
- Map each to a specific requirement reference.

### 1.4. Directory & Module Boundaries Map
- Provide a clean ASCII directory structure of the proposed routes and folders.
- Highlight folders/namespaces used for team ownership isolation.
- Show colocated private actions, controller actions, or local helper files.

### 1.5. Team Delegation Grid
- Assign ownership clearly in a table:
  | Member | Modules / Folders Owned | Interfaces / Endpoints Owned | Data Schemas / Entities Owned | Workload Weight |
  | :--- | :--- | :--- | :--- | :--- |
- Balanced logic: High interface/endpoint count must balance with low complexity; high complexity must balance with low page count.

### 1.6. Data Storage & Access Policies
- Define centralized schema roles, database tables, local states, or access control rules (such as RLS, ACL, or permission models).
- Identify the migration flow and order of operations.

### 1.7. Cross-Cutting Utilities & Integrations
- Explicitly assign shared libraries, global middleware, configuration files, and root templates.
- Map the boundary interfaces to prevent cross-domain/cross-module imports.

### 1.8. Sequence Diagrams (Mermaid)
- Draw sequence flows for any multi-step transactions, background/async jobs, or logic that spans multiple domains.

### 1.9. Execution Schedule (Milestones)
- List date ranges with specific deliverables per member.
- Highlight the **Critical Path** (the foundational tasks that block other members).
- Incorporate a buffer day before integration and presentation.

---

## 2. Planning Rules & Guardrails

These rules must be enforced by any planning agent:

### 2.1. Structural Hygiene (Form)
* **Declarative Format (Plan & Context only):** Do not write prose in plans, status files, or context documents. Use bullet points, code blocks, tables, and lists. Define strict limits, rules, and boundaries (what to do vs. what not to do).
  * *Exception:* Rationale and trade-off justifications are permitted in the "User Review" and "Risks" sections of plans to prevent logical deadlocks. Active chat responses remain conversational.
* **Relative Pointer Bounds:** Keep active plans, context files, and status files under 200 lines. Store each fact in exactly one owner file and reference it via relative paths. This limit does NOT apply to application source code (.tsx, .ts, .sql).

### 2.2. Architecture & Traceability (Scope)
* **Single-Owner Lifecycle:** Designate a single owner for every directory, file, and database table. The owner is responsible for its security, tests, and migrations.
* **Traceable Selective Scoping:** Choose only the plan template sections relevant to the active task's scope. The **Proposed Changes (Actionable Diffs)** and **Verification Plan** are always mandatory. Trace all changes back to a functional requirement.

### 2.3. Execution & Integration Integrity (Action)
* **Actionable Execution Contracts:** Schedule foundational logic/types before UI pages. Inline critical constraints directly in entry points instead of link-chaining. Calculate net line differences for edits, and provide exact search-and-replace text blocks (no hand-waving or placeholders).

### 2.4. Audit & Posture (Verification)
* **Skeptical & Pragmatic Posture:** Never blindly agree with user proposals. Critically evaluate feasibility, security, and operational constraints. Explicitly justify why the recommended option works and why alternatives or naive assumptions will fail.
* **Conflict Auditing:** Classify conflicts into Tier 1 (Runtime breakages), Tier 2 (API/documentation drift), and Tier 3 (Stale status logs).

### 2.5. Token-Saving Exploration Protocol (Research Gate)
* **When the task is investigatory, exploratory, or during planning, enforce these rules to prevent credit/token burn:**
  1. **Index-Only Mapping:** Read `context/README.md`, the root `README.md`, and `.plan/README.md` first to locate file boundaries and routes. Do not execute recursive folder listings or view code files outside your delegated route group scope.
  2. **No Redundant Reading:** Do not call `view_file` on the same file path consecutively or repeatedly in the same turn without a specific validation purpose.
  3. **Targeted Line Range Reads:** Specify `StartLine` and `EndLine` only when targeted lines are known via grep. For small-to-medium files (under 300 lines), read the file in a single call to minimize tool execution token overhead.
  4. **Targeted Searches:** Use `grep_search` with strict path filters (`Includes`) to locate definitions instead of running general directory crawling.
  5. **Narrow Verification Logs:** Run only the specific, narrow test file (e.g., `npx vitest src/tests/auth.test.ts`) instead of the full test suite (`npm run test`) to avoid logging large stdout dumps.
  6. **Interface-Only Planning:** During planning, inspect only `interface` signatures, types, database schemas, and plan files. Do not view full page or action implementations until execution begins.

### 2.6. Plan Compliance Audit
* Every plan must conclude with a compliance table auditing line budgets, diff actions, owners, and alternative trade-off justifications.

