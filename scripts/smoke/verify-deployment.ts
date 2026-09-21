// KAMOTI deployed test site smoke verification (issue #14).
//
// Verifies environment readiness against a deployed test site:
// - Health check (/api/health)
// - Public board access (/api/public/reports and /api/public/stats)
// - Authentication for Citizen, Staff, and Administrator fixture accounts
// - Protected route rejection for unauthenticated requests (401)
// - Role authorization rejection for wrong-role requests (403)
// - Protected route access for authorized roles (200)
//
// Can run against the deployed test site or any specified target URL.
// Never logs secret tokens or credentials.

import "dotenv/config";

const DEFAULT_URL = "https://kamoti-chi.vercel.app";
const DEFAULT_FIXTURE_PASSWORD = "Password123!";

type Role = "citizen" | "staff" | "admin";

interface TestUser {
  email: string;
  role: Role;
  label: string;
}

const FIXTURE_USERS: TestUser[] = [
  { email: "fixture-citizen-1@kamoti.invalid", role: "citizen", label: "Citizen" },
  { email: "fixture-staff-1@kamoti.invalid", role: "staff", label: "Staff" },
  { email: "fixture-admin@kamoti.invalid", role: "admin", label: "Administrator" },
];

function parseArg(flag: string): string | null {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) return args[i + 1] ?? null;
    if (args[i]?.startsWith(`${flag}=`)) return args[i]!.slice(flag.length + 1);
  }
  return null;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: bun scripts/smoke/verify-deployment.ts [options]

Options:
  --url <url>         Target deployment URL (default: ${DEFAULT_URL})
  --password <pass>   Fixture account password (default: ${DEFAULT_FIXTURE_PASSWORD})
  -h, --help          Show this help message

Environment variables:
  DEPLOYED_TEST_URL   Target deployment URL
  TEST_URL            Fallback target deployment URL
  FIXTURE_PASSWORD    Fixture account password
`);
  process.exit(0);
}

const baseUrl = (parseArg("--url") ?? process.env.DEPLOYED_TEST_URL ?? process.env.TEST_URL ?? DEFAULT_URL).replace(/\/+$/, "");
const password = parseArg("--password") ?? process.env.FIXTURE_PASSWORD ?? DEFAULT_FIXTURE_PASSWORD;


interface StepResult {
  name: string;
  status: "PASS" | "FAIL";
  detail: string;
}

const results: StepResult[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, status: ok ? "PASS" : "FAIL", detail });
  const icon = ok ? "[PASS]" : "[FAIL]";
  console.log(`${icon} ${name}: ${detail}`);
}

async function run(): Promise<void> {
  console.log(`\n=== KAMOTI Deployed Site Smoke Check ===`);
  console.log(`Target URL: ${baseUrl}\n`);

  // 1. Health endpoint check
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 200 && (body as { status?: string }).status === "ok";
    record("Health check (/api/health)", ok, `HTTP ${res.status} (status: ${(body as { status?: string }).status})`);
  } catch (err) {
    record("Health check (/api/health)", false, `Connection error: ${(err as Error).message}`);
  }

  // 2. Public transparency board check
  try {
    const res = await fetch(`${baseUrl}/api/public/reports`);
    const body = (await res.json().catch(() => ({}))) as { reports?: unknown[]; total?: number };
    const ok = res.status === 200 && Array.isArray(body.reports);
    record(
      "Public transparency board (/api/public/reports)",
      ok,
      `HTTP ${res.status} (reports count: ${body.reports?.length ?? 0}, total: ${body.total ?? 0})`,
    );
  } catch (err) {
    record("Public transparency board (/api/public/reports)", false, `Connection error: ${(err as Error).message}`);
  }

  // 3. Public stats check
  try {
    const res = await fetch(`${baseUrl}/api/public/stats`);
    const ok = res.status === 200;
    record("Public stats (/api/public/stats)", ok, `HTTP ${res.status}`);
  } catch (err) {
    record("Public stats (/api/public/stats)", false, `Connection error: ${(err as Error).message}`);
  }

  // 4. Role authentication checks
  const tokens: Record<Role, string | null> = { citizen: null, staff: null, admin: null };

  for (const user of FIXTURE_USERS) {
    try {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        user?: { role?: string; email?: string };
        access_token?: string;
      };
      const ok = res.status === 200 && body.user?.role === user.role && Boolean(body.access_token);
      if (ok && body.access_token) {
        tokens[user.role] = body.access_token;
      }
      record(
        `Sign-in for ${user.label} (${user.email})`,
        ok,
        `HTTP ${res.status} (role: ${body.user?.role ?? "none"})`,
      );
    } catch (err) {
      record(`Sign-in for ${user.label} (${user.email})`, false, `Connection error: ${(err as Error).message}`);
    }
  }

  // 5. Unauthenticated protected-route smoke check
  const unauthName = "Unauthenticated request rejection (/api/reports)";
  try {
    const res = await fetch(`${baseUrl}/api/reports`);
    const ok = res.status === 401;
    record(unauthName, ok, `HTTP ${res.status} (expected 401)`);
  } catch (err) {
    record(unauthName, false, `Connection error: ${(err as Error).message}`);
  }

  // 6. Wrong-role authorization smoke check (Citizen calling Admin endpoint)
  const citizenWrongRoleName = "Wrong-role request rejection (Citizen accessing /api/admin/users)";
  if (tokens.citizen) {
    try {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${tokens.citizen}` },
      });
      const ok = res.status === 403;
      record(citizenWrongRoleName, ok, `HTTP ${res.status} (expected 403)`);
    } catch (err) {
      record(citizenWrongRoleName, false, `Connection error: ${(err as Error).message}`);
    }
  } else {
    record(citizenWrongRoleName, false, "Skipped: Citizen token not available");
  }

  // 7. Wrong-role authorization smoke check (Staff calling Admin endpoint)
  const staffWrongRoleName = "Wrong-role request rejection (Staff accessing /api/admin/users)";
  if (tokens.staff) {
    try {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${tokens.staff}` },
      });
      const ok = res.status === 403;
      record(staffWrongRoleName, ok, `HTTP ${res.status} (expected 403)`);
    } catch (err) {
      record(staffWrongRoleName, false, `Connection error: ${(err as Error).message}`);
    }
  } else {
    record(staffWrongRoleName, false, "Skipped: Staff token not available");
  }

  // 8. Authorized protected-route smoke check (Citizen accessing own reports)
  const citizenAccessName = "Authorized Citizen route access (/api/reports)";
  if (tokens.citizen) {
    try {
      const res = await fetch(`${baseUrl}/api/reports`, {
        headers: { Authorization: `Bearer ${tokens.citizen}` },
      });
      const body = (await res.json().catch(() => ({}))) as { reports?: unknown[] };
      const ok = res.status === 200 && Array.isArray(body.reports);
      record(citizenAccessName, ok, `HTTP ${res.status} (reports count: ${body.reports?.length ?? 0})`);
    } catch (err) {
      record(citizenAccessName, false, `Connection error: ${(err as Error).message}`);
    }
  } else {
    record(citizenAccessName, false, "Skipped: Citizen token not available");
  }

  // 9. Authorized protected-route smoke check (Staff accessing assigned reports)
  const staffAccessName = "Authorized Staff route access (/api/reports)";
  if (tokens.staff) {
    try {
      const res = await fetch(`${baseUrl}/api/reports`, {
        headers: { Authorization: `Bearer ${tokens.staff}` },
      });
      const body = (await res.json().catch(() => ({}))) as { reports?: unknown[] };
      const ok = res.status === 200 && Array.isArray(body.reports);
      record(staffAccessName, ok, `HTTP ${res.status} (reports count: ${body.reports?.length ?? 0})`);
    } catch (err) {
      record(staffAccessName, false, `Connection error: ${(err as Error).message}`);
    }
  } else {
    record(staffAccessName, false, "Skipped: Staff token not available");
  }

  // 10. Authorized Administrator route access (/api/admin/users)
  const adminAccessName = "Authorized Admin route access (/api/admin/users)";
  if (tokens.admin) {
    try {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      const body = (await res.json().catch(() => ({}))) as { users?: unknown[] };
      const ok = res.status === 200 && Array.isArray(body.users);
      record(adminAccessName, ok, `HTTP ${res.status} (users count: ${body.users?.length ?? 0})`);
    } catch (err) {
      record(adminAccessName, false, `Connection error: ${(err as Error).message}`);
    }
  } else {
    record(adminAccessName, false, "Skipped: Admin token not available");
  }

  // Summary
  const allPassed = results.every((r) => r.status === "PASS");
  const passedCount = results.filter((r) => r.status === "PASS").length;
  console.log(`\nResult: ${passedCount}/${results.length} checks passed.`);

  if (!allPassed) {
    console.error("Smoke check failed.");
    process.exit(1);
  }
  console.log("All deployed smoke checks completed successfully.\n");
}

run();
