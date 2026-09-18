# Repo Structure Plan — `backend/` + wireframes coexistence

**Assessed:** 2026-09-18 · against commit `a118763` + working tree
**Verdict:** One repo, one root. Do **not** split. Normalize naming before `frontend/` lands.

---

## 1. Glossary

| Term | Meaning here |
| :--- | :--- |
| `.dc.html` | Claude Design canvas source — editable artboards |
| `_ds/` | Design-system bundle; `styles.css` is the token source for `frontend/` |
| Standalone render | `KAMOTI Wireframes.html` — 342 KB, self-contained, zero external refs |
| Tracked | Committed to git; `.gitignore` has **no effect** on tracked files |

---

## 2. Why they do not conflict

| Check | Result |
| :--- | :--- |
| Competing `package.json` / lockfiles | None — wireframe folder has no deps, no build, no npm |
| Port / process collision | None — wireframes are static files, never served |
| Path refs out of `.dc.html` | Only `_ds/<uuid>/styles.css` + `_ds_bundle.js`, **relative to its own dir** |
| Folder-name self-references | `0` across all three HTML files and `support.js` |
| Embedded `claude.ai` URL | None |

**Rule:** renaming the parent folder is content-safe. Separating `.dc.html` from `_ds/` is **not** — they must stay siblings.

---

## 3. Conflict Audit (current state)

| Tier | # | Finding | Status | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| T1 | 1 | Root `.gitignore` was empty | **Fixed, uncommitted** | ` M .gitignore` |
| T1 | 2 | Wireframes untracked | **Fixed** | commit `a118763` |
| T1 | 3 | `docs/` still untracked — one machine only | **Open** | `?? docs/` |
| T2 | 4 | Folder name has spaces at repo root | **Open** | `cd "Wireframe Screens Project"` |
| T2 | 5 | `CLAUDE.md` cites `docs/backend-explained.md` + `docs/wireframe-api-review.md`; **neither exists**, never committed, no recovery from history | **Open** | `git log --diff-filter=D -- docs/` → empty |
| T2 | 6 | `_ds/` manifest lists 12 cards (`components/*.html`, `foundations/*.html`, `theme.html`); readme cites `templates/` + `theme.json`. **None on disk** — only `styles.css` survived export | **Open** | `ls _ds/modernist-*/` → 5 files, no subdirs |
| T3 | 7 | Proposal PDF tracked **twice**, byte-identical (469 KB × 2) | **Worse** — duplicate now in history | `md5sum` → both `a5e3a90d4da78d150a1e9f966149e6e7` |
| T3 | 8 | `.gitignore` line `ITS122-GROUP-4-Final Project Proposal Draft.pdf` is a **no-op** — the file is tracked | **Open** | `git ls-files \| grep pdf` → 2 hits |
| T3 | 9 | `backend/.gitignore` ignores `.env.example`, which is already tracked | **Open, harmless** | `backend/.gitignore:4` |

---

## 4. Why not two repos

Rejected. The coupling is documented, not incidental:

- `Wireframe Screens Project/github.md` maps all 19 screens to specific `backend/src/**` files. A split turns that table into cross-repo links that rot silently.
- `frontend/` must consume `_ds/…/styles.css` as its token source. Cross-repo that becomes a package publish or submodule — real ceremony for a semester project.
- Phase 3 requires submitting **one complete project folder** that runs. Two repos actively works against the graded deliverable.
- Single clone = the whole submission.

---

## 5. Proposed Changes (Actionable Diffs)

### Step 1 — Commit the already-fixed `.gitignore`

Working tree is correct. Add a trailing newline, then stage:

```bash
printf '\n' >> .gitignore
git add .gitignore
```

### Step 2 — Untrack the duplicate PDF

`.gitignore` cannot untrack it. Required:

```bash
git rm --cached "Wireframe Screens Project/uploads/ITS122-GROUP-4-Final Project Proposal Draft.pdf"
```

Keeps the root copy, which the ignore rule also fails to cover. Decide one:

- **Keep root PDF tracked** → delete the `ITS122-GROUP-4-Final Project Proposal Draft.pdf` line from `.gitignore` (it lies today).
- **Untrack root PDF too** → `git rm --cached "ITS122-GROUP-4-Final Project Proposal Draft.pdf"` and keep the line.

The 469 KB blob stays in history either way. **Do not rewrite history** — not worth it at this size, and it breaks every groupmate's clone.

### Step 3 — Rename (preserves history)

```bash
git mv "Wireframe Screens Project" design
```

Result:

```text
LAH/
├── backend/                 # Express 5 API
├── supabase/                # migrations + tests
├── frontend/                # Phase 3 deliverable — to come
├── design/                  # was "Wireframe Screens Project"
│   ├── KAMOTI Wireframes.dc.html      # canvas source
│   ├── KAMOTI Wireframes.html         # standalone render (portable)
│   ├── support.js                     # canvas runtime (vendored)
│   ├── github.md                      # screen → source map
│   └── _ds/modernist-<uuid>/
│       └── styles.css                 # ← token source for frontend/
├── docs/
└── CLAUDE.md
```

### Step 4 — Commit `docs/`

```bash
git add docs/
```

### Step 5 — Update `CLAUDE.md`

Two edits, both required:

1. `Wireframe Screens Project/` → `design/` (1 occurrence).
2. **Reference docs** section — delete the two dead bullets (`backend-explained.md`, `wireframe-api-review.md`), add `Phase3-Required-Student-Submission.md` and this file. Net ≈ 0 lines.

---

## 6. Risk — read before Step 3

The canvas is published as an Artifact. Artifact updates bind to **file path**, so republishing from `design/` mints a **new** artifact URL instead of updating the existing one. The file carries no embedded URL, so nothing breaks locally.

- Still editing the canvas at its current link → rename **after** the wireframes are frozen.
- Otherwise → rename now, accept a fresh link.

---

## 7. Verification Plan

| # | Check | Pass condition |
| :--- | :--- | :--- |
| 1 | `git status --porcelain` after commit | Empty |
| 2 | Open `design/KAMOTI Wireframes.dc.html` | Modernist styling intact → `_ds/` sibling link survived |
| 3 | `grep -rn "Wireframe Screens Project" --exclude-dir=.git .` | Zero hits |
| 4 | `git ls-files \| grep -c pdf` | `1` (or `0` if both untracked) |
| 5 | `mkdir -p frontend/node_modules && git status` | `node_modules` not listed |
| 6 | `cd backend && npm run dev` → `curl localhost:4000/api/health` | `{"status":"ok"}` |
| 7 | Every path in `CLAUDE.md` § Reference docs | Resolves on disk |

---

## 8. Open Items (not in scope here)

- `_ds/` is a partial export (T2/#6). Only `styles.css` is usable — treat it as the token file and ignore the manifest's missing component pages, or re-export the full bundle.
- Phase 3 requires **search/filter**. The API has no `q=` param on `GET /api/reports` and no `category_id` on `/api/public/reports`. Frontend-only filtering caps at `per_page` (50 / 100).
- `docs/backend-explained.md` and `docs/wireframe-api-review.md` are unrecoverable from git. Rewrite or drop the references.

---

## 9. Plan Compliance Audit

| Rule | Status |
| :--- | :--- |
| Declarative format | Pass — tables/blocks; prose limited to §4 and §6 rationale |
| Relative pointer bounds (<200 lines) | Pass |
| Single-owner lifecycle | Pass — `design/`, `backend/`, `supabase/`, `frontend/` each one owner |
| Actionable diffs, no placeholders | Pass — exact commands; Step 2 branches on an explicit decision |
| Verification plan | Pass — 7 checks, binary conditions |
| Skeptical posture | Pass — two-repo rejected with evidence; T3/#8 contradicts the current `.gitignore`; history rewrite rejected |
| Traceability | Pass — findings carry command-level evidence |
