---
name: verify-kamoti
description: Drive and verify the KAMOTI civic reporting platform locally across public, citizen, staff, and admin workflows. Use for /verify-kamoti, verifying UI/UX edge cases, capturing screenshot evidence, or proving changes before presentation.
disable-model-invocation: true
---

# Verify KAMOTI

Drive the KAMOTI full-stack application end to end, exercise user flows across viewports, and capture evidence into `tests/evidence/`.

## 1. Launch

Start the backend API and frontend Vite server concurrently:

```bash
bun run dev
```

Ready indicators:
- Backend API: answering HTTP 200 on `http://localhost:4000/api/public/stats`
- Frontend Web: answering HTTP 200 on `http://localhost:5173`

Single command ready check:
```bash
curl -s http://localhost:4000/api/public/stats && curl -s http://localhost:5173
```

Optional realistic demonstration seed:
```bash
# Generate and apply realistic Makati demonstration reports and photos
bun run seed:demo:makati
```

## 2. Doctor

Run this read-only pre-flight check before driving the application:

```bash
bun run typecheck
```

Check fixture database connectivity and deployment health:
```bash
bun run test:smoke
```

If ports 4000 or 5173 are occupied by orphaned processes:
```powershell
# Windows PowerShell check and termination, excluding system idle process 0
Get-NetTCPConnection -LocalPort 4000,5173 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## 3. Drive

### Automated Playwright Harness
Execute the full browser suite or single targeted flows:

```bash
# Run all browser tests headless
bun run test:browser

# Run specific persona or feature suite
npx playwright test tests/browser/auth.browser.ts
npx playwright test tests/browser/public.browser.ts
npx playwright test tests/browser/citizen.browser.ts
npx playwright test tests/browser/staff.browser.ts
npx playwright test tests/browser/admin.browser.ts
npx playwright test tests/browser/responsive.browser.ts
```

### Pre-Configured Test Personas
Credentials defined in `tests/browser/helpers.ts`:
- Admin: `fixture-admin@kamoti.invalid` / `Password123!`
- Citizen 1: `fixture-citizen-1@kamoti.invalid` / `Password123!`
- Citizen 2: `fixture-citizen-2@kamoti.invalid` / `Password123!`
- Staff 1: `fixture-staff-1@kamoti.invalid` / `Password123!`
- Staff 2: `fixture-staff-2@kamoti.invalid` / `Password123!`

### Interactive and Agent Browser Drive
When an agent drives the browser directly:
1. Set viewport size (mobile 375x812, tablet 768x1024, desktop 1280x800).
2. Navigate to target URL (`http://localhost:5173/`).
3. Exercise interactive elements using semantic IDs and accessible selectors (`#email`, `#password`, `button[type="submit"]`).
4. Capture screenshot proof on completion.

## 4. Evidence Standards

All visual evidence must be captured directly into `tests/evidence/`:
- Format: Full-page PNG screenshots named by feature and viewport (e.g. `FUNC-12-mobile-nav.png`, `CITIZEN-wizard-step3.png`, `ADMIN-tab-navigation.png`, `PHOTO-lightbox-modal.png`).
- Proof criteria:
  - Exercise the authentic user path with no test-only bypasses.
  - Capture both the action triggering state change and the resulting UI state.
  - Verify zero console errors and clean layout with no horizontal page scroll on mobile viewports.

## 5. Cleanup

Remove automated test data remnants and terminate background servers:

```bash
# Clean up reports and remarks created by fixture accounts carrying [TEST] prefix
bun run test:cleanup
```

```powershell
# Terminate dev servers running on ports 4000 and 5173, excluding idle process 0
Get-NetTCPConnection -LocalPort 4000,5173 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Evidence files in `tests/evidence/` survive cleanup for presentation slide use.

## 6. Feature Map Index

Detailed driving recipes and gotchas are indexed in `features/`:
- [Public Transparency Board](features/public-board.md)
- [Citizen Reporting and Tracking](features/citizen-reporting.md)
- [Staff Queue and Triage](features/staff-queue.md)
- [Admin Management and Navigation](features/admin-management.md)
- [Authentication and Session Management](features/authentication.md)
