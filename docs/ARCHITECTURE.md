# Architecture

KAMOTI is one full stack application with one root package. The frontend,
API, and database have separate responsibilities while sharing a repository.

| Part | Owns | Entry |
| :--- | :--- | :--- |
| `src/web/` | React pages and browser interactions | `main.tsx` |
| `src/server/app.ts` | Express middleware and route mounting | `app` |
| `src/server/routes/` | HTTP inputs, responses, and role gates | `/api/*` |
| `src/server/services/` | Report permissions, status flow, history, and notifications | Report functions |
| `src/server/config/` | Environment and Supabase clients | `env`, `db`, `auth` |
| `supabase/` | Database schema, access rules, seed, and regression test | SQL migrations |

The browser calls relative `/api/*` URLs. During development Vite proxies
them to Express on port 4000. For deployment Vercel serves the built Vite site
and sends API requests to the Node function in `api/index.ts`, which calls
the same Express app. `server.ts` only starts the local Node listener.

Supabase Auth issues access tokens. The API verifies each token, loads the
profile role, and checks access before using the service role database client.
That key stays on the server. Report rules live in
`src/server/services/reports.service.ts`; route files handle transport
details. Protected data goes through the API. The public board reads the
filtered `public_reports` view.

Use [Final_Project.md](Final_Project.md) for intended behavior and system
diagrams, [API.md](API.md) for setup and endpoint usage, and
[Guide.md](Guide.md) for course requirements. The application schema has eight
related tables. Supabase Auth's external `auth.users` table is shown separately
in the proposal.
