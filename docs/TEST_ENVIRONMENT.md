# Deployed test environment

This document owns the deployed test environment configuration, baseline
handoff record, and smoke verification procedure for Phase 4 testing.

## Overview and purpose

The deployed test site provides a stable, shared environment for Phase 4
browser automation, responsive design inspection, security evidence collection,
and peer usability sessions. It serves the current frontend and API through the
documented Vercel request path backed by an approved test Supabase project.

## Non-secret handoff record

| Property | Value | Notes |
| :--- | :--- | :--- |
| **Stable test URL** | `https://kamoti-chi.vercel.app` | Public production deployment on Vercel |
| **Baseline commit SHA** | `ccad629` | Remote `origin/main` Phase 4 baseline |
| **Last verified application** | `20a50ed` | 15 October 2026 ([#64 report](../tests/evidence/issue64/report.md)): hosted checks while production served `df8ee38`; local suites again on `20a50ed`, which adds only web edit-form drafts (#69). The #64 commits change only tests and documentation |
| **Hosting platform** | Vercel | Vite frontend static assets with serverless Node.js API functions |
| **Serverless region** | Singapore (`sin1`) | Co-located with Supabase cluster to minimize query roundtrips |
| **Database target** | Supabase (`chqyxlyrmudmkanqmpil`) | Dedicated development/test project. Sign-up is open on the live site, so it holds real people's accounts beside the synthetic data; see [Real accounts on the test project](#real-accounts-on-the-test-project) |
| **Environment purpose** | Phase 4 verification | Functional testing, security checks, and peer usability testing. It stays up as the team's portfolio after the course |
| **Configuration owner** | Project Lead / Deployment Owner | Owns Vercel environment variables and Supabase credentials |

All sensitive keys (`SUPABASE_SECRET_KEY`, database passwords, service role keys)
remain strictly in private environment settings and must never be committed to
repository files, issue descriptions, logs, or evidence captures.

## Real accounts on the test project

Anyone can register on the live site, and real people have: team members,
classmates, and guests. Since 16 October 2026 the footer, the sign-up form, and
the proof step say that KAMOTI is a student project and ask for a sample
document, not a real one. The consent wording did not change, and the database
records only when each person consented, not which wording they saw.

On 15 October 2026 the project held 24 accounts with addresses outside
`kamoti.invalid`. The project lead decided on 16 October 2026 (#74):

| Accounts | Count | Decision |
| :--- | ---: | :--- |
| Staff and Administrators | 7 | Team accounts, kept; the team shares them for testing |
| Citizens awaiting review, no proof | 11 | Kept as they are until the project is retired; they see the upload step |
| Citizens awaiting review, proof uploaded | 5 | An Administrator reviews them with the four checks (#63) |
| Citizens, inactive | 1 | Left inactive |

The uploaded documents stay private. An account's current proof is never
removed (#70), and the project stays up as a portfolio, so they are kept until
the project is retired; then empty the residency bucket. Open a proof that is
not synthetic only to review it, never on a shared screen, and keep its contents
out of issues, evidence, and logs.

- **Who may register:** anyone. Testers and presentation guests use the fixture
  or demo accounts ([usability procedure](Usability_Testing.md#before-the-session)).
  A team member who demonstrates sign-up uses their own inbox, for the email
  code, and a sample proof.
- **Presenting:** sign in as `demo-makati-admin@kamoti.invalid`, and search
  Admin Users for `kamoti.invalid` before showing the list, so real names and
  addresses stay off screen.

## Vercel deployment configuration

The repository owns the deployment specification in [`vercel.json`](../vercel.json):

1. **Compute Region:** Serverless functions are pinned to Singapore (`regions: ["sin1"]`), co-locating the API runtime with the Supabase database cluster in Southeast Asia. This avoids transatlantic roundtrips and keeps API latency under 50ms.
2. **Git Branch Policy:** Preview deployments on non-main branches are disabled (`git.deploymentEnabled: { "**": false, "main": true }`). This prevents failed preview deployments on contributor branches and pull requests due to private repository seat restrictions, while preserving production deployments from `main`. Pull requests are validated in CI via GitHub Actions (`.github/workflows/ci.yml`).
3. **HTTP Response Security Headers:** Standard security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`) are applied across all routes.
4. **URL Rewrites:** Maps `/api/*` to the serverless entry point in `api/index.ts` and falls back all client routes to `index.html` for single-page client routing.

## Database migrations status

All 25 files in [`supabase/migrations/`](../supabase/migrations/) are applied,
ending with `20261015000400_proof_retention.sql` (#76). The migration owner
confirmed the first 23 on 15 October 2026; on 16 October a read-only schema
check found the column and functions that the last two add. Check the current state with
`bunx supabase migration list`; see [API.md](API.md#database-migrations).

The Phase 4 baseline had the first six:

1. `20260918000001_schema.sql` (Core schema, tables, foreign keys, and indexes)
2. `20260918000002_rls.sql` (Row Level Security policies)
3. `20260918000003_reference_data.sql` (Initial reference data and categories)
4. `20260918000004_api_access.sql` (API service role grants and public permissions)
5. `20260918000005_report_inspections.sql` (Inspection tracking and review records)
6. `20260918000006_public_reports_filters.sql` (Public reports view and query filters)

## Synthetic test fixture data

The test environment uses synthetic test accounts and reports generated by the
guarded fixture command. All test accounts belong to the reserved `.invalid`
domain and share the standard verification password:

| Alias | Role | Standard Password | Notes |
| :--- | :--- | :--- | :--- |
| `fixture-admin@kamoti.invalid` | Administrator | `Password123!` | Management screens and user access |
| `fixture-citizen-1@kamoti.invalid` | Citizen | `Password123!` | Owns two fixture reports |
| `fixture-citizen-2@kamoti.invalid` | Citizen | `Password123!` | Owns one fixture report |
| `fixture-staff-1@kamoti.invalid` | Staff | `Password123!` | Assigned one fixture report |
| `fixture-staff-2@kamoti.invalid` | Staff | `Password123!` | Unassigned staff member |

Initial reports present in the test environment:

- `[FIXTURE] Broken streetlight on Sample Avenue` (Owner: citizen-1, Status: `pending`)
- `[FIXTURE] Overflowing drainage canal on Test Street` (Owner: citizen-2, Status: `pending`)
- `[FIXTURE] Pothole cluster on Demo Boulevard` (Owner: citizen-1, Assigned: staff-1, Status: `under_review`)

The fixture retains its safe-target guard (`--target <REF>`) to ensure data is
never applied to an unapproved database target.

### Makati presentation dataset

On 2026-09-27, the separate `makati-demo-v1` seed added 36 demo accounts and
150 synthetic Makati reports to this project. It includes 30 pending, 30 under
review, 30 in progress, 50 resolved, and 10 cancelled reports, with history,
notifications, and labelled illustrative images. Existing records were
preserved. These are initial seed counts; normal demo interactions can change
the report states later.

The first apply verified that all 269 pre-existing application rows remained
unchanged. All six migrations were confirmed applied before seeding. The seed
does not deploy frontend changes to Vercel or remove older `ZZ TEST` content.

On 2026-09-28, the presentation copy was refreshed in this project. The
`makati-demo-v1` reports, account display names, history, and notifications now
use ordinary report wording. Three older cancelled reports also had their
`[DEMO]` titles and synthetic descriptions replaced. A read-only check found
zero remaining `[DEMO]` report titles and zero demo wording in the marked seed
records. The illustration labels in the PNG assets were not changed.

### Presentation logins

For a presentation, sign in at the [deployed site](https://kamoti-chi.vercel.app)
or a local app connected to project `chqyxlyrmudmkanqmpil` using one of these
accounts. The fixture logins above are for automated tests; `fixture-staff-1`
has only one assigned `[FIXTURE]` report.

**Presentation password for every account below:** `Km!_HzdrZj-p6ciRmy-VyTrLwImMa9KZFe8`

The fixture password `Password123!` does not work for these accounts. This
password belongs only to the disposable `chqyxlyrmudmkanqmpil` test project;
do not reuse it elsewhere.

| Screen to show | Email | Display name | Seeded reports |
| :--- | :--- | :--- | :--- |
| Admin dashboard, reports, users | `demo-makati-admin@kamoti.invalid` | Nina Valdez | All 150 presentation reports, plus existing test records |
| Staff queue | `demo-makati-staff-1@kamoti.invalid` | Mariel Dela Cruz | 50 assigned |
| Staff queue | `demo-makati-staff-2@kamoti.invalid` | Paolo Bautista | 34 assigned |
| Staff queue | `demo-makati-staff-3@kamoti.invalid` | Liza Mercado | 17 assigned |
| Staff queue | `demo-makati-staff-4@kamoti.invalid` | Ramon Flores | 17 assigned |
| Empty staff queue | `demo-makati-staff-5@kamoti.invalid` | Celia Aquino | None, intentionally |
| Citizen reports | `demo-makati-citizen-1@kamoti.invalid` | Ana Santos | 14 owned |
| Citizen reports | `demo-makati-citizen-2@kamoti.invalid` | Ben Santos | 7 owned |

Other presentation citizens follow `demo-makati-citizen-3@kamoti.invalid`
through `demo-makati-citizen-30@kamoti.invalid`; the seed credentials file
lists every account. The counts above describe the initial seed. Subsequent
test activity can change report assignments and states. Admin pages include
both presentation and fixture records because they show the whole project.

Use the [Makati demo seed instructions](LOCAL_DEV.md#makati-demo-seed) for
generation, preview, application, verification, private credentials, and retry
behavior.

## Smoke verification procedure

To verify that the deployed test site is healthy and accessible:

```bash
bun run test:smoke
```

To run smoke checks against an alternate deployment URL:

```bash
bun run test:smoke -- --url https://your-alternate-deployment.vercel.app
```

### Configuration options

The smoke test runner supports CLI flags and environment variable overrides:

| Setting | CLI Flag | Environment Variable | Default |
| :--- | :--- | :--- | :--- |
| **Target URL** | `--url <url>` | `DEPLOYED_TEST_URL` or `TEST_URL` | `https://kamoti-chi.vercel.app` |
| **Fixture password** | `--password <pass>` | `FIXTURE_PASSWORD` | `Password123!` |
| **Help message** | `-h`, `--help` | N/A | N/A |

### Verified smoke criteria

1. **Health endpoint:** `GET /api/health` returns `200 OK` with `{"status":"ok"}`.
2. **Public transparency board:** `GET /api/public/reports` returns `200 OK` with active public reports.
3. **Public stats:** `GET /api/public/stats` returns `200 OK`.
4. **Authentication:** `POST /api/auth/login` succeeds for Citizen, Staff, and Administrator fixture accounts.
5. **Route protection:** Unauthenticated requests to protected endpoints return `401 Unauthorized`.
6. **Authorization gating:** Cross-role access requests (such as Citizen or Staff requesting Administrator endpoints) return `403 Forbidden`.
7. **Authorized access:** Role-authorized callers access protected endpoints successfully (`200 OK` for Citizen, Staff, and Administrator).

## Defect boundary

The test environment ticket owns readiness and verification only. If any
application defect or unexpected behavior is uncovered during smoke testing or
subsequent test sessions, it must be reported as a separate linked GitHub issue
rather than patched inside environment configuration work.
