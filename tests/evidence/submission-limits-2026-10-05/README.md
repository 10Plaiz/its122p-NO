# Citizen submission limits evidence

Verified on 5 October 2026 against the isolated local Supabase CLI project
`kamoti-issue-60`. Supabase CLI 2.117.0 applied all 19 repository migrations.
Auth, PostgreSQL, the Data API, and Storage were real services. The API ran
with Node; Chromium drove the React application through Vite.

| Check | Observed result |
| :--- | :--- |
| `bun run typecheck` | All four TypeScript configurations passed. The test configuration also passed after the audit-label test correction. |
| `bun run test` | 556 tests passed across 32 files; zero failures. |
| `bun run build` | API compilation and production web build passed. |
| `supabase/tests/api_access.sql` | Browser-role access assertions passed; transaction rolled back. |
| `tests/database/submission-limits.sql` | 41 assertions passed; transaction rolled back. |
| `bun run test:submission-limits` | 13 scenarios passed through real Auth, Storage, RPCs, and two independent Node workers. |
| `bun run test:submission-browser` | Four browser scenarios passed through live API responses. |
| `bun run test:smoke -- --url http://localhost:4000` | 12 of 12 local smoke checks passed. |

The runtime suite exercised account thresholds, shared-network report admission,
concurrent requests, restart persistence, expiry recovery, ownership and role
checks, spoofed local forwarded headers, a real lock timeout, and RPC failure.
It compared stored image bytes and checked report, photo, Storage object, and
notification counts after refusals. SQL checks also covered network photo and
proof limits, bundle admission, the latest blocking expiry, and bounded cleanup.

The browser suite filled the report wizard, selected an image, submitted it,
observed a real `429`, returned to earlier steps, and retried after the database
deadline. Text, category, location, photo, and session survived. Storage held the
same image bytes after the retry. A photo-free report used JSON and spent no
photo allowance. Proof `429` and `503` responses retained the file and session.
Dismissal of the reload warning kept the selected proof. Restoring the RPC
allowed a manual retry with the same proof bytes.

Short-lived account quota fixtures induced the browser refusal and recovery.
The failure check temporarily revoked RPC execution in this disposable database
and restored it in `finally`. No browser request was intercepted. Synthetic
accounts and application records were retained. The smoke Citizen fixture used
the normal proof-upload route to become eligible for reporting.

| Screenshot | State shown |
| :--- | :--- |
| [Report before submission](report-before-mobile.png) | The mobile form with entered text and a selected image. |
| [Report after refusal](report-limited-mobile.png) | The same form after a live `429`, with its retry deadline and retained inputs. |
| [Proof after refusal](proof-limited-desktop.png) | Desktop proof form after a live `429`. |
| [Proof during RPC failure](proof-unavailable-mobile.png) | Mobile proof form after a live `503`. |

The report pair shows states before and after the submit action on this branch,
not a comparison with the previous application version. Full-page screenshots
were inspected. The checks found no horizontal page overflow at 375×812 or
1280×800, no JavaScript errors, and no unexpected console errors. Expected
browser resource errors for HTTP `429` and `503` were excluded.

These checks establish local behavior. They do not measure legitimate demand,
Staff review capacity, hosted latency, or Vercel's delivery of the client IP.
The thresholds remain an agreed trial policy. No shared database migration or
deployment was performed. Reproduction instructions are in
[the local-development guide](../../../docs/LOCAL_DEV.md#verify-submission-limits-with-an-isolated-local-stack).
