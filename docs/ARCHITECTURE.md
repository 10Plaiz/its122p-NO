# Architecture

KAMOTI is one full stack application with one root package. The frontend,
API, and database have separate responsibilities while sharing a repository.

| Part | Owns | Entry |
| :--- | :--- | :--- |
| `src/web/` | React pages and browser interactions | `main.tsx` |
| `src/server/app.ts` | Express middleware and route mounting | `app` |
| `src/server/middleware/` | Authentication and route-level role gates | `requireAuth`, `requireRole` |
| `src/server/routes/` | HTTP inputs and responses | `/api/*` |
| `src/server/services/` | Record permissions, status flow, history, and notifications | Service functions |
| `src/server/config/` | Environment and Supabase clients | `env`, `db`, `auth` |
| `supabase/migrations/` | Database schema and database access boundaries | SQL migrations |
| `supabase/tests/` | Regression checks for database exposure | `api_access.sql` |
| `tests/database/` | Transaction rollback and privileged action checks | `atomic-actions.sql` |

The browser calls relative `/api/*` URLs. During development Vite proxies
them to Express on port 4000. For deployment Vercel serves the built Vite site
and sends API requests to the Node function in `api/index.ts`, which calls
the same Express app. `server.ts` only starts the local Node listener.

Supabase Auth issues access tokens. The API verifies each token, loads the
profile role, and checks application permissions before using the secret-key
database client. Middleware owns authentication and broad role gates. Services
own record-level decisions such as report ownership and assignment. Route files
handle transport details.

Database exposure is a separate boundary. Migrations deny browser database
roles access to protected tables and expose only approved public reads. The
regression test in `supabase/tests/api_access.sql` verifies that boundary.
Protected application data goes through Express; the public board reads the
filtered `public_reports` view.

Closure requests and reviews use database functions that lock the report and
save its state, history, audit entry, and notifications in one transaction.
Review includes the timestamp of the request the Administrator saw. A replaced
or completed request cannot be approved with that old timestamp. Approval also
requires a different account from the requester.

Privileged profile creation, profile changes, residency review, and manual
phone verification also save their audit entries in their database transaction.
Supabase Auth account creation happens before profile creation and cannot join
that transaction. If profile creation fails, an Auth account can remain without
an application profile or its requested privileges. Other report actions still
use separate database writes.

Residency proof files use a private Storage bucket. API responses return a
proof-present flag instead of the object path. An Administrator can obtain a
five-minute file URL only after the API saves a proof-view audit entry.
Each proof has an immutable object path and proof identity. The profile has a
review version that covers its proof, identity, address, and decision. Proof
access and residency decisions use the displayed version. The database checks
that version under the profile lock before it saves a decision and its effects.
Proof attachment and self account changes also use locked database functions.
Storage uploads remain separate from the database transaction. Failed or
uncertain attachments retain the uploaded object so they cannot remove a
committed current proof. The [API guide](API.md#residency-reviews) owns
the exact fields, retry rules, and retention proposal.

Use [Final_Project.md](Final_Project.md) for intended behavior and system
diagrams, [FRONTEND.md](FRONTEND.md) for browser routes and page behavior,
[API.md](API.md) for endpoint usage, [LOCAL_DEV.md](LOCAL_DEV.md) for local
setup, and [Guide.md](Guide.md) for course requirements. The migrations own the
current application schema. Supabase Auth's external `auth.users` table is
separate from the application profiles.
