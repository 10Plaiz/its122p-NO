# Shared account limits and cookie sessions, 15 October 2026

Issues: KI-12 (refresh cookie) and KI-14 (shared limits), from the #55 security
review.

## Target

| Item | Value |
| :--- | :--- |
| Revision | `0d83cd6` (Group A on `main`) plus the uncommitted KI-14 changes |
| Database | Local Supabase CLI 2.117.0 stack `kamoti`, all 22 migrations, marked `kamoti.test_database = 'disposable'` |
| Data | Existing local fixture and demo seed, plus one `security-*@kamoti.invalid` citizen per security run |
| Shared project | Not contacted |

## Results

| Check | Command | Result |
| :--- | :--- | :--- |
| Limiter SQL | `psql ... -f tests/database/auth-rate-limits.sql` | 18/18 |
| Database access | `psql ... -f supabase/tests/api_access.sql` | Pass |
| Citizen quotas SQL | `psql ... -f tests/database/submission-limits.sql` | 41/41 |
| Security suite | `bun run test:security -- --target 127` | 44/44, including IMP-10, IMP-14, and the new IMP-16 |
| Two API processes | Ports 4101 and 4102, alternating wrong passwords for one new address | Attempts 1-10 answered `401`; attempt 11 answered `429` |
| Stored keys | `select ... from public.auth_rate_counters` | 20 counters; every key a 64-character hash; none contains `@` |

Before KI-14, each process would have allowed ten failures of its own.

## Not run here

`tests/database/atomic-actions.sql` stopped at "request retains history". That
check counts every `report_updates` row and expects exactly one, so it needs a
freshly migrated database. This stack holds the demo seed (502 updates). The
new migration does not touch reports.
