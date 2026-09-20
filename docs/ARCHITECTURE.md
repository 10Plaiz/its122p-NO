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

Use [Final_Project.md](Final_Project.md) for intended behavior and system
diagrams, [FRONTEND.md](FRONTEND.md) for browser routes and page behavior,
[API.md](API.md) for endpoint usage, [LOCAL_DEV.md](LOCAL_DEV.md) for local
setup, and [Guide.md](Guide.md) for course requirements. The application schema
has eight related tables. Supabase Auth's external `auth.users` table is shown
separately in the proposal.
