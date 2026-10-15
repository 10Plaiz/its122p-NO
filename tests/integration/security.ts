// KAMOTI Phase 4 Security Integration Test Suite
//
// Verifies real Express API routes against the local Supabase stack using synthetic
// fixture accounts (fixture-*@kamoti.invalid) and one new security-* citizen per run.
//
// Safety contract:
// - Refuses to run unless --target names the configured Supabase project.
// - Refuses any project but the local stack (127.0.0.1 or localhost).
// - Requires fixture password via --password, FIXTURE_PASSWORD env, or piped stdin / prompt.
// - Never prints secrets, access tokens, or credentials.
// - Restores fixture report states and cleans up temporary test records.

import "dotenv/config";
import type { Server } from "node:http";
import { createInterface } from "node:readline";
import { stdin, exit } from "node:process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { app } from "../../src/server/app.js";
import { db } from "../../src/server/config/supabase.js";

// ---------------------------------------------------------------------- guards

function projectRef(url: string): string | null {
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function parseArg(argv: string[], name: string): string | null {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1] ?? null;
    if (argv[i]?.startsWith(`${name}=`)) return argv[i]!.slice(name.length + 1);
  }
  return null;
}

async function readPipedLines(): Promise<string[] | null> {
  if (stdin.isTTY) return null;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stdin) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/).map((line) => line.trim());
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let value = "";
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.off("data", onData);
          stdin.pause();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          process.stdout.write("\n");
          exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
          if (stdin.isTTY) process.stdout.write("\b \b");
          continue;
        }
        value += ch;
      }
    };
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

// ------------------------------------------------------------------ test runner

interface TestResult {
  id: string;
  category: string;
  name: string;
  status: "PASS" | "FAIL";
  durationMs: number;
  error?: string;
}

const results: TestResult[] = [];

async function runCase(
  id: string,
  category: string,
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  const start = performance.now();
  try {
    await fn();
    const durationMs = Math.round(performance.now() - start);
    results.push({ id, category, name, status: "PASS", durationMs });
    console.log(`[PASS] ${id} - ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - start);
    results.push({ id, category, name, status: "FAIL", durationMs, error: err?.message || String(err) });
    console.error(`[FAIL] ${id} - ${name} (${durationMs}ms): ${err?.message || err}`);
  }
}

// ------------------------------------------------------------------------ main

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const target = parseArg(argv, "--target");
  const explicitPassword = parseArg(argv, "--password") ?? process.env.FIXTURE_PASSWORD ?? null;

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    console.error("Refused: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.");
    exit(1);
  }

  const configured = projectRef(supabaseUrl);
  if (!configured) {
    console.error("Refused: SUPABASE_URL is invalid.");
    exit(1);
  }

  if (!target) {
    console.error(
      `Refused: This test calls the development Supabase project. Pass --target ${configured} ` +
        "to confirm this run is aimed at the approved project.",
    );
    exit(1);
  }

  if (target !== configured) {
    console.error(`Refused: --target ${target} does not match configured project ${configured}.`);
    exit(1);
  }

  // This suite deletes the records it creates and leaves synthetic accounts
  // behind, so it runs only against the disposable local stack (#53).
  if (!["127.0.0.1", "localhost"].includes(new URL(supabaseUrl).hostname)) {
    console.error(
      "Refused: this suite writes and deletes records, so it runs only against the local " +
        "Supabase stack (SUPABASE_URL=http://127.0.0.1:54321). See docs/LOCAL_DEV.md.",
    );
    exit(1);
  }

  let fixturePassword = explicitPassword;
  if (!fixturePassword) {
    const piped = await readPipedLines();
    if (piped && piped[0]) {
      fixturePassword = piped[0];
    } else {
      fixturePassword = await askHidden("Enter fixture password (hidden): ");
    }
  }

  if (!fixturePassword || fixturePassword.length < 8) {
    console.error("Refused: Fixture password must be at least 8 characters.");
    exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`KAMOTI Security Integration Test Suite`);
  console.log(`Target: ${configured}`);
  console.log(`======================================================\n`);

  // Start ephemeral Express server
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address() as { address: string; port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const cleanups: (() => Promise<void>)[] = [];

  try {
    // 1. Fetch fixture reports from database
    const { data: fixtureReports, error: fetchErr } = await db
      .from("reports")
      .select("id, title, status, citizen_id, assigned_staff_id")
      .like("title", "[FIXTURE]%");

    if (fetchErr || !fixtureReports || fixtureReports.length < 3) {
      throw new Error(
        `Fixture reports not ready on ${configured} (${fixtureReports?.length ?? 0} found). ` +
          "Run 'bun run fixture' first.",
      );
    }

    const reportPendingCitizen1 = fixtureReports.find(
      (r) => r.title.includes("Broken streetlight") && r.status === "pending",
    );
    const reportPendingCitizen2 = fixtureReports.find(
      (r) => r.title.includes("Overflowing drainage") && r.status === "pending",
    );
    const reportUnderReview = fixtureReports.find(
      (r) => r.title.includes("Pothole cluster") && r.status === "under_review",
    );

    if (!reportPendingCitizen1 || !reportPendingCitizen2 || !reportUnderReview) {
      throw new Error("Fixture reports do not match expected status/assignment baseline.");
    }

    // 2. Fetch active category from database for non-destructive testing
    const { data: activeCategories, error: catErr } = await db
      .from("categories")
      .select("id, name, description, is_active")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .limit(1);

    if (catErr || !activeCategories || activeCategories.length === 0) {
      throw new Error(`No active categories found on ${configured}. Apply migrations and fixtures first.`);
    }

    const testCategory = activeCategories[0]!;

    // Citizen quotas count every attempt for an hour, so a rerun would hit 429
    // where a case expects 400. The stack is local (guarded above): start clean.
    const ledger = await db.from("citizen_submission_events").delete().gte("id", 0);
    if (ledger.error) throw new Error(`Could not clear the local submission ledger: ${ledger.error.message}`);
    const originalCategoryDesc = testCategory.description ?? null;

    // Helper request wrapper
    async function api(path: string, options: RequestInit = {}) {
      const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        // empty body or non-JSON
      }
      return { status: res.status, ok: res.ok, headers: res.headers, body: json };
    }

    // KI-12: the refresh token arrives only as the HttpOnly kamoti_refresh cookie.
    function refreshCookieOf(res: { headers: Headers }) {
      const match = /kamoti_refresh=([^;]+)/.exec(res.headers.get("set-cookie") ?? "");
      return match ? decodeURIComponent(match[1]!) : null;
    }
    const refreshWith = (token: string) =>
      api("/api/auth/refresh", { method: "POST", headers: { Cookie: `kamoti_refresh=${encodeURIComponent(token)}`, "X-KAMOTI-Session": "1" } });

    async function login(email: string) {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password: fixturePassword }),
      });
      if (!res.ok) throw new Error(`Login failed for ${email} with status ${res.status}`);
      return res.body.access_token as string;
    }

    // ------------------------------------------------------------------ Section C: Authentication
    console.log("--- Section C: Authentication Tests ---");

    let citizen1Token = "";
    let citizen2Token = "";
    let staff1Token = "";
    let staff2Token = "";
    let adminToken = "";

    await runCase("AUTH-04", "Authentication", "valid citizen login returns token and profile", async () => {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "fixture-citizen-1@kamoti.invalid", password: fixturePassword }),
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.access_token || res.body.user?.role !== "citizen") {
        throw new Error("Missing access_token or invalid user role");
      }
      citizen1Token = res.body.access_token;
    });

    await runCase("AUTH-05", "Authentication", "valid staff login returns token and profile", async () => {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "fixture-staff-1@kamoti.invalid", password: fixturePassword }),
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.access_token || res.body.user?.role !== "staff") {
        throw new Error("Missing access_token or invalid user role");
      }
      staff1Token = res.body.access_token;
    });

    await runCase("AUTH-06", "Authentication", "valid administrator login returns token and profile", async () => {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "fixture-admin@kamoti.invalid", password: fixturePassword }),
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!res.body.access_token || res.body.user?.role !== "admin") {
        throw new Error("Missing access_token or invalid user role");
      }
      adminToken = res.body.access_token;
    });

    // Also get tokens for citizen-2 and staff-2
    citizen2Token = await login("fixture-citizen-2@kamoti.invalid");
    staff2Token = await login("fixture-staff-2@kamoti.invalid");

    await runCase("AUTH-07", "Authentication", "incorrect password returns 401 unauthorized", async () => {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "fixture-citizen-1@kamoti.invalid", password: "WrongPassword999!" }),
      });
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      if (!res.body.error?.includes("do not match")) {
        throw new Error(`Unexpected error message: ${res.body.error}`);
      }
    });

    await runCase("AUTH-08", "Authentication", "unknown account returns 401 unauthorized", async () => {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "unknown-account@kamoti.invalid", password: "Password123!" }),
      });
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    await runCase("AUTH-09", "Authentication", "empty login form submission returns 400 bad request", async () => {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "", password: "" }),
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (!Array.isArray(res.body.details) || res.body.details.length === 0) {
        throw new Error("Expected field-level validation details");
      }
    });

    await runCase("AUTH-10", "Authentication", "protected route access without session returns 401", async () => {
      const res = await api("/api/reports");
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      if (res.body.error !== "Sign in to continue.") {
        throw new Error(`Unexpected error message: ${res.body.error}`);
      }
    });

    await runCase("AUTH-11", "Authentication", "user logout clears session without side effects", async () => {
      const res = await api("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      if (res.status !== 204) throw new Error(`Expected 204 No Content, got ${res.status}`);
    });

    // Refresh citizen1 token after logout test
    citizen1Token = await login("fixture-citizen-1@kamoti.invalid");

    // ------------------------------------------------------------------ Section D: Authorization
    console.log("\n--- Section D: Authorization Tests ---");

    await runCase("AUTHZ-06", "Authorization", "citizen reads own report detail", async () => {
      const res = await api(`/api/reports/${reportPendingCitizen1.id}`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (res.body.report?.id !== reportPendingCitizen1.id) {
        throw new Error("Returned report ID mismatch");
      }
    });

    await runCase("AUTHZ-07", "Authorization", "citizen denied reading another citizen report", async () => {
      const res = await api(`/api/reports/${reportPendingCitizen1.id}`, {
        headers: { Authorization: `Bearer ${citizen2Token}` },
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
      if (!res.body.error?.includes("only view your own reports")) {
        throw new Error(`Unexpected denial message: ${res.body.error}`);
      }
    });

    await runCase("AUTHZ-08", "Authorization", "assigned staff reads assigned report detail", async () => {
      const res = await api(`/api/reports/${reportUnderReview.id}`, {
        headers: { Authorization: `Bearer ${staff1Token}` },
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

    await runCase("AUTHZ-09", "Authorization", "unassigned staff denied reading unassigned report", async () => {
      const res = await api(`/api/reports/${reportUnderReview.id}`, {
        headers: { Authorization: `Bearer ${staff2Token}` },
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
      if (!res.body.error?.includes("assigned to you")) {
        throw new Error(`Unexpected denial message: ${res.body.error}`);
      }
    });

    await runCase("AUTHZ-10", "Authorization", "administrator reads any report detail", async () => {
      for (const rep of [reportPendingCitizen1, reportPendingCitizen2, reportUnderReview]) {
        const res = await api(`/api/reports/${rep.id}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (res.status !== 200) throw new Error(`Admin failed to read ${rep.id} with status ${res.status}`);
      }
    });

    await runCase("AUTHZ-11", "Authorization", "citizen denied access to admin user management", async () => {
      const res = await api("/api/admin/users", {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await runCase("AUTHZ-12", "Authorization", "staff denied access to admin user management", async () => {
      const res = await api("/api/admin/users", {
        headers: { Authorization: `Bearer ${staff1Token}` },
      });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await runCase("AUTHZ-13", "Authorization", "citizen edits own pending report", async () => {
      const originalTitle = reportPendingCitizen1.title;
      const res = await api(`/api/reports/${reportPendingCitizen1.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: JSON.stringify({ title: "[FIXTURE] Broken streetlight on Sample Avenue (Updated)" }),
      });

      // Always register cleanup immediately after dispatching mutation
      cleanups.push(async () => {
        await db.from("reports").update({ title: originalTitle }).eq("id", reportPendingCitizen1.id);
        await db.from("report_updates").delete().eq("report_id", reportPendingCitizen1.id).eq("update_type", "edit");
      });

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status} (${res.body?.error})`);
    });

    await runCase("AUTHZ-14", "Authorization", "citizen denied editing non-pending report", async () => {
      const res = await api(`/api/reports/${reportUnderReview.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: JSON.stringify({ title: "Unauthorized modification attempt" }),
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
    });

    await runCase("AUTHZ-15", "Authorization", "non-owning citizen denied editing pending report", async () => {
      const res = await api(`/api/reports/${reportPendingCitizen1.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${citizen2Token}` },
        body: JSON.stringify({ title: "Tamper attempt by non-owner" }),
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
    });

    // ------------------------------------------------------------------ Section B: SQL Injection
    console.log("\n--- Section B: SQL Injection Tests ---");

    await runCase("SQLI-06", "SQL Injection", "search filter payload causes no syntax error or bypass", async () => {
      const payloads = [
        "' OR '1'='1",
        "admin'--",
        "1 UNION SELECT null, null, null",
        "' OR 'x'='x",
        "test' OR 'a'='a",
      ];
      for (const payload of payloads) {
        const res = await api(`/api/public/reports?q=${encodeURIComponent(payload)}`);
        if (res.status !== 200) throw new Error(`Payload ${payload} failed with status ${res.status}`);
        if (!Array.isArray(res.body.reports)) throw new Error("Expected reports array in response");
      }
    });

    await runCase("SQLI-07", "SQL Injection", "status query parameter injection rejected by schema", async () => {
      const res = await api(`/api/public/reports?status=${encodeURIComponent("' OR 1=1 --")}`);
      if (res.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    });

    await runCase("SQLI-08", "SQL Injection", "sort query parameter injection rejected by schema", async () => {
      const res = await api(`/api/public/reports?sort=${encodeURIComponent("submitted_at; DROP TABLE reports; --")}`);
      if (res.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    });

    await runCase("SQLI-09", "SQL Injection", "malicious report ID parameter returns 404 without SQL error", async () => {
      const res = await api(`/api/reports/${encodeURIComponent("1' OR '1'='1")}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status !== 404) throw new Error(`Expected 404 Not Found, got ${res.status}`);
      if (res.body?.error !== "That report does not exist.") {
        throw new Error(`Unexpected response: ${JSON.stringify(res.body)}`);
      }
    });

    await runCase("SQLI-10", "SQL Injection", "category_id query injection rejected by integer coercion", async () => {
      const res = await api(`/api/public/reports?category_id=${encodeURIComponent("1; SELECT pg_sleep(5)")}`);
      if (res.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    });

    // ------------------------------------------------------------------ Section E: Cross-Site Scripting (XSS)
    console.log("\n--- Section E: Cross-Site Scripting Tests ---");

    let createdReportId: string | null = null;

    await runCase("XSS-01", "Cross-Site Scripting", "report submission stores XSS payload strictly as literal data", async () => {
      const xssTitle = "<script>alert('xss-title')</script> Pipe leak";
      const xssDescription = '<img src=x onerror="alert(1)"> Flooding reported on sidewalk.';
      // RS-4: every new report needs its category's main problem.
      const { data: problem } = await db
        .from("problem_types")
        .select("id")
        .eq("category_id", testCategory.id)
        .eq("is_active", true)
        .order("id")
        .limit(1)
        .single();

      const res = await api("/api/reports", {
        method: "POST",
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: JSON.stringify({
          title: xssTitle,
          description: xssDescription,
          category_id: testCategory.id,
          primary_problem_id: problem?.id,
          latitude: 14.5547,
          longitude: 121.0244,
          address_text: "Synthetic Test Street corner XSS Ave",
        }),
      });

      if (res.status === 201 && res.body?.report?.id) {
        createdReportId = res.body.report.id;
        cleanups.push(async () => {
          await db.from("notifications").delete().eq("report_id", createdReportId!);
          await db.from("report_updates").delete().eq("report_id", createdReportId!);
          await db.from("reports").delete().eq("id", createdReportId!);
        });
      } else {
        throw new Error(`Failed to create report: ${res.status} (${res.body?.error})`);
      }

      // Verify the payload is preserved strictly as data (unaltered string, not evaluated or executed)
      const fetchRes = await api(`/api/reports/${createdReportId}`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      if (fetchRes.status !== 200) throw new Error(`Failed to fetch created report: ${fetchRes.status}`);
      if (fetchRes.body.report.title !== xssTitle) {
        throw new Error("Title string was mutated unexpectedly");
      }
      if (fetchRes.body.report.description !== xssDescription) {
        throw new Error("Description string was mutated unexpectedly");
      }
    });

    await runCase("XSS-02", "Cross-Site Scripting", "staff remark stores script tags strictly as plain text", async () => {
      const xssRemark = "<script>alert('staff-remark')</script> Site inspected by field team.";
      const res = await api(`/api/reports/${reportUnderReview.id}/remarks`, {
        method: "POST",
        headers: { Authorization: `Bearer ${staff1Token}` },
        body: JSON.stringify({ details: xssRemark }),
      });

      // Always register cleanup immediately after remark creation
      cleanups.push(async () => {
        await db.from("report_updates").delete().eq("report_id", reportUnderReview.id).eq("details", xssRemark);
        await db.from("notifications").delete().eq("report_id", reportUnderReview.id).like("message", "%remark was added%");
      });

      if (res.status !== 201) throw new Error(`Failed to add remark: ${res.status}`);

      // Verify history holds exact string
      const histRes = await api(`/api/reports/${reportUnderReview.id}/updates`, {
        headers: { Authorization: `Bearer ${staff1Token}` },
      });
      if (histRes.status !== 200) throw new Error(`Failed to fetch updates: ${histRes.status}`);
      const addedUpdate = histRes.body.updates?.find((u: any) => u.details === xssRemark);
      if (!addedUpdate) throw new Error("XSS remark was not found in updates history");
    });

    await runCase("XSS-03", "Cross-Site Scripting", "administrator category input preserves HTML as literal text", async () => {
      const xssCategoryDesc = "Hazardous infrastructure <script>alert(1)</script>";
      const res = await api(`/api/categories/${testCategory.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ description: xssCategoryDesc }),
      });

      // Always register cleanup immediately after category mutation
      cleanups.push(async () => {
        await db.from("categories").update({ description: originalCategoryDesc }).eq("id", testCategory.id);
        await db.from("activity_logs").delete().eq("entity_type", "category").eq("entity_id", String(testCategory.id));
      });

      if (res.status !== 200) throw new Error(`Failed to update category: ${res.status}`);
      if (res.body?.category?.description !== xssCategoryDesc) {
        throw new Error("Category description did not match payload");
      }
    });

    await runCase("XSS-04", "Cross-Site Scripting", "search queries with XSS payload return JSON without execution", async () => {
      const payload = "<script>alert('search-xss')</script>";
      const res = await api(`/api/public/reports?q=${encodeURIComponent(payload)}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Expected application/json content type, got ${contentType}`);
      }
    });

    // ------------------------------------------------------------------ Section I: Phase 2 improvements
    // KI-08: the residency lock, the private proofs bucket, the feedback table, and
    // the tables added for rejection and area routing. Direct-access checks go
    // through Supabase's Data API with the publishable key, as a browser would.
    console.log("\n--- Section I: Phase 2 Improvements ---");

    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const anonClient = createClient(supabaseUrl!, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const userClient = (token: string) =>
      createClient(supabaseUrl!, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

    await runCase("IMP-01", "Residency Lock", "a citizen with no accepted proof gets 403 residency_required on citizen routes", async () => {
      // Lock fixture citizen 2 for this case only; restored at once and in cleanup.
      const { data: profile } = await db.from("profiles").select("id, residency_status").eq("email", "fixture-citizen-2@kamoti.invalid").single();
      const original = profile!.residency_status as string | null;
      const restore = async () => {
        await db.from("profiles").update({ residency_status: original }).eq("id", profile!.id);
      };
      cleanups.push(restore);
      await db.from("profiles").update({ residency_status: null }).eq("id", profile!.id);
      try {
        const token = await login("fixture-citizen-2@kamoti.invalid");
        for (const path of ["/api/reports", "/api/notifications", `/api/feedback/${reportPendingCitizen2!.id}`, "/api/exports/reports?format=csv"]) {
          const res = await api(path, { headers: { Authorization: `Bearer ${token}` } });
          if (res.status !== 403 || res.body?.details?.code !== "residency_required") {
            throw new Error(`${path}: expected 403 residency_required, got ${res.status} ${JSON.stringify(res.body?.details)}`);
          }
        }
      } finally {
        await restore();
      }
    });

    await runCase("IMP-02", "Residency Proofs", "neither anonymous nor signed-in clients can list or read the residency-proofs bucket", async () => {
      const path = `security-test/${Date.now()}.pdf`;
      const upload = await db.storage.from("residency-proofs").upload(path, Buffer.from("%PDF-1.4\n%%EOF\n"), { contentType: "application/pdf" });
      if (upload.error) throw new Error(`Set-up upload failed: ${upload.error.message}`);
      cleanups.push(async () => {
        await db.storage.from("residency-proofs").remove([path]);
      });
      for (const [who, client] of [["anonymous", anonClient], ["citizen", userClient(citizen1Token)]] as const) {
        const download = await client.storage.from("residency-proofs").download(path);
        if (!download.error) throw new Error(`${who} could download a residency proof`);
        const list = await client.storage.from("residency-proofs").list("security-test");
        if (!list.error && (list.data ?? []).length > 0) throw new Error(`${who} could list residency proofs`);
      }
    });

    await runCase("IMP-03", "Residency Proofs", "only an administrator gets a link to a proof", async () => {
      const { data: profile } = await db.from("profiles").select("id").eq("email", "fixture-citizen-1@kamoti.invalid").single();
      for (const [who, token] of [["staff", staff1Token], ["citizen", citizen1Token]] as const) {
        const res = await api(`/api/admin/users/${profile!.id}/residency-proof`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status !== 403) throw new Error(`${who}: expected 403, got ${res.status}`);
      }
    });

    await runCase("IMP-04", "Direct Data Access", "report_feedback, barangays, and staff_areas are closed to direct clients; feedback_summary cannot be called", async () => {
      for (const table of ["report_feedback", "barangays", "staff_areas"]) {
        for (const [who, client] of [["anonymous", anonClient], ["citizen", userClient(citizen1Token)]] as const) {
          const read = await client.from(table).select("*").limit(1);
          if (!read.error && (read.data ?? []).length > 0) throw new Error(`${who} could read ${table}`);
        }
      }
      const write = await userClient(citizen1Token).from("report_feedback").insert({ report_id: reportPendingCitizen1!.id, rating: 5 });
      if (!write.error) throw new Error("A citizen could write report_feedback directly");
      const rpc = await anonClient.rpc("feedback_summary");
      if (!rpc.error) throw new Error("Anonymous clients could call feedback_summary");
    });

    await runCase("IMP-05", "Feedback Rules", "a citizen cannot rate someone else's report (403) or an unresolved one (400)", async () => {
      const notMine = await api(`/api/feedback/${reportPendingCitizen1!.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${citizen2Token}` },
        body: JSON.stringify({ rating: 5 }),
      });
      if (notMine.status !== 403) throw new Error(`Rating another citizen's report: expected 403, got ${notMine.status}`);
      const unresolved = await api(`/api/feedback/${reportPendingCitizen1!.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: JSON.stringify({ rating: 5 }),
      });
      if (unresolved.status !== 400) throw new Error(`Rating a pending report: expected 400, got ${unresolved.status}`);
    });

    await runCase("IMP-06", "Feedback Rules", "staff cannot read another staff member's rating summary", async () => {
      const { data: other } = await db.from("profiles").select("id").eq("email", "fixture-staff-2@kamoti.invalid").single();
      const res = await api(`/api/feedback/summary/staff?staff_id=${other!.id}`, { headers: { Authorization: `Bearer ${staff1Token}` } });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await runCase("IMP-07", "Public Data", "the public board exposes a closure reason only for rejected reports", async () => {
      const { data, error } = await anonClient.from("public_reports").select("status, rejection_reason, barangay");
      if (error) throw new Error(`public_reports unreadable: ${error.message}`);
      const leaked = (data ?? []).filter((row) => row.status !== "rejected" && row.rejection_reason !== null);
      if (leaked.length > 0) throw new Error(`${leaked.length} non-rejected report(s) expose a closure reason`);
    });

    await runCase("IMP-08", "Citizen Comments", "a citizen cannot comment on another citizen's report", async () => {
      const res = await api(`/api/reports/${reportPendingCitizen1!.id}/remarks`, {
        method: "POST",
        headers: { Authorization: `Bearer ${citizen2Token}` },
        body: JSON.stringify({ details: "Not my report." }),
      });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await runCase("IMP-09", "Makati Bounds", "a report pinned outside Makati is refused on the latitude field", async () => {
      const res = await api("/api/reports", {
        method: "POST",
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: JSON.stringify({ title: "Bataan pin", description: "A pin far outside the city.", category_id: testCategory.id, primary_problem_id: 1, latitude: 14.676, longitude: 120.536 }),
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (!JSON.stringify(res.body?.details ?? "").includes("Pick a spot inside Makati")) throw new Error("Missing the Makati field error");
    });

    await runCase("IMP-10", "Session Handling", "signing out with an expired access token still ends the session (KI-13)", async () => {
      // A session of its own, so the tokens the rest of the suite uses stay valid.
      const session = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "fixture-citizen-1@kamoti.invalid", password: fixturePassword }),
      });
      const refreshToken = refreshCookieOf(session);
      if (!refreshToken) throw new Error("No refresh cookie from login");
      const out = await api("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: "Bearer expired.or.garbage", Cookie: `kamoti_refresh=${encodeURIComponent(refreshToken)}` },
      });
      if (out.status !== 204) throw new Error(`Expected 204 from logout, got ${out.status}`);
      const reused = await refreshWith(refreshToken);
      if (reused.status !== 401) throw new Error(`The old refresh token still works after sign-out: ${reused.status}`);
    });

    await runCase("IMP-16", "Session Handling", "the refresh token is an HttpOnly cookie and refresh needs the session header (KI-12)", async () => {
      const session = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "fixture-citizen-1@kamoti.invalid", password: fixturePassword }),
      });
      if (session.status !== 200) throw new Error(`Sign-in: expected 200, got ${session.status}`);
      if (session.body?.refresh_token !== undefined) throw new Error("The login body still carries the refresh token");
      const cookie = session.headers.get("set-cookie") ?? "";
      for (const part of ["HttpOnly", "SameSite=Strict", "Path=/api/auth"]) {
        if (!cookie.includes(part)) throw new Error(`The refresh cookie lacks ${part}: ${cookie}`);
      }
      const token = refreshCookieOf(session)!;
      const forged = await api("/api/auth/refresh", { method: "POST", headers: { Cookie: `kamoti_refresh=${encodeURIComponent(token)}` } });
      if (forged.status !== 403) throw new Error(`Refresh without the session header: expected 403, got ${forged.status}`);
      const refreshed = await refreshWith(token);
      if (refreshed.status !== 200 || !refreshCookieOf(refreshed)) throw new Error(`Refresh: expected 200 and a new cookie, got ${refreshed.status}`);
      await api("/api/auth/logout", { method: "POST", headers: { Cookie: `kamoti_refresh=${encodeURIComponent(refreshCookieOf(refreshed)!)}` } });
    });

    await runCase("IMP-11", "Account Details", "a citizen edits their own details; a new number loses its verified mark and a new barangay goes back to review (UA-13)", async () => {
      const staffEdit = await api("/api/auth/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${staff1Token}` },
        body: JSON.stringify({ first_name: "Staff", last_name: "One", barangay: "Poblacion", address_line: "1 City Hall Road" }),
      });
      if (staffEdit.status !== 403) throw new Error(`Staff using the citizen edit: expected 403, got ${staffEdit.status}`);

      const bad = await api("/api/auth/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: JSON.stringify({ first_name: "Fixture", last_name: "Citizen", barangay: "Pembo", address_line: "12 Sample Street" }),
      });
      if (bad.status !== 400) throw new Error(`A barangay outside Makati: expected 400, got ${bad.status}`);

      // Restore citizen 1 exactly as it was, whatever happens below.
      const fields = "first_name, middle_name, last_name, suffix, name, contact_number, phone_verified_at, barangay, address_line, residency_status, residency_note, residency_reviewed_by, residency_reviewed_at";
      const { data: before, error: snapshotError } = await db.from("profiles").select(`id, ${fields}`).eq("email", "fixture-citizen-1@kamoti.invalid").single();
      if (snapshotError || !before) throw new Error("Could not read the citizen account before the details test");
      const restore = async () => {
        const { id, residency_status, residency_note, residency_reviewed_by, residency_reviewed_at, ...details } = before;
        const restoredDetails = await db.from("profiles").update(details).eq("id", id);
        if (restoredDetails.error) throw new Error("Could not restore citizen identity and address details");
        const restoredResidency = await db.from("profiles").update({ residency_status, residency_note, residency_reviewed_by, residency_reviewed_at }).eq("id", id);
        if (restoredResidency.error) throw new Error("Could not restore the citizen residency decision");
      };
      cleanups.push(restore);
      try {
        await db.from("profiles").update({ contact_number: "09171234567", phone_verified_at: new Date().toISOString(), residency_status: "verified" }).eq("id", before!.id);
        const res = await api("/api/auth/me", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${citizen1Token}` },
          body: JSON.stringify({ first_name: "Fixture", last_name: "Citizen", contact_number: "09181234567", barangay: "Bel-Air", address_line: "45 New Street" }),
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status} ${res.body?.error ?? ""}`);
        const { data: after } = await db.from("profiles").select("name, phone_verified_at, residency_status, barangay").eq("id", before!.id).single();
        if (after?.phone_verified_at !== null) throw new Error("A new number kept its verified mark");
        if (after?.residency_status !== "pending") throw new Error(`A new barangay should go back to review, got ${after?.residency_status}`);
        if (after?.name !== "Fixture Citizen" || after?.barangay !== "Bel-Air") throw new Error("Details were not saved");
        const { data: log } = await db.from("activity_logs").select("metadata").eq("action", "user.updated").eq("entity_id", before!.id).order("created_at", { ascending: false }).limit(1).single();
        const logged = (log?.metadata as { contact_number?: { from: string; to: string } } | null)?.contact_number;
        if (logged?.from !== "09171234567" || logged?.to !== "09181234567") throw new Error("The old and new number were not logged");
      } finally {
        await restore();
      }
    });

    // ------------------------------------------------------------------ Section J: Account and residency protections (#53)
    // One new synthetic citizen per run, kept afterwards like every account (DM-1):
    // it uploads a real proof, is approved, files and rates a report, and is
    // finally deactivated. The local-only guard above is what makes that safe.
    console.log("\n--- Section J: Account and Residency Protections ---");

    // A real 1x1 PNG, accepted both as a proof of residency and as a report photo.
    const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
    const multipart = (path: string, token: string, form: FormData) =>
      fetch(`${baseUrl}${path}`, { method: "POST", headers: bearer(token), body: form });
    const pngForm = (field: string, extra: Record<string, string> = {}) => {
      const form = new FormData();
      form.append(field, new Blob([PNG], { type: "image/png" }), "evidence.png");
      for (const [key, value] of Object.entries(extra)) form.append(key, value);
      return form;
    };
    const count = async (table: string, column: string, value: string) => {
      const { count: total, error } = await db.from(table).select("*", { count: "exact", head: true }).eq(column, value);
      if (error) throw new Error(`Could not count ${table}: ${error.message}`);
      return total ?? 0;
    };

    const securityEmail = `security-${Date.now()}@kamoti.invalid`;
    const securityPassword = `S3curity!${Date.now()}`;
    let securityToken = "";
    let securityRefresh = "";
    let securityId = "";
    let securityReportId = "";

    await runCase("IMP-12", "Residency Proofs", "an administrator gets a working, audited 5-minute proof link through the API; a stale version gets 409", async () => {
      const created = await db.auth.admin.createUser({
        email: securityEmail,
        password: securityPassword,
        email_confirm: true,
        user_metadata: { first_name: "Security", last_name: "Check", barangay: "Poblacion", address_line: "1 Test Street", privacy_consent_at: new Date().toISOString() },
      });
      if (created.error) throw new Error(`Could not create the synthetic citizen: ${created.error.message}`);
      const session = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: securityEmail, password: securityPassword }) });
      if (session.status !== 200) throw new Error(`Synthetic citizen sign-in: expected 200, got ${session.status}`);
      securityToken = session.body.access_token;
      securityRefresh = refreshCookieOf(session) ?? "";
      securityId = session.body.user.id;

      const submissionId = randomUUID();
      const upload = await multipart(`/api/auth/me/residency-proof?submission_id=${submissionId}`, securityToken,
        pngForm("proof", { submission_id: submissionId, expected_version: session.body.user.residency_review_version }));
      if (upload.status !== 200) throw new Error(`Proof upload: expected 200, got ${upload.status} ${await upload.text()}`);

      const { data: profile } = await db.from("profiles").select("residency_review_version").eq("id", securityId).single();
      const version = profile!.residency_review_version as string;
      const auditsBefore = await db.from("activity_logs").select("*", { count: "exact", head: true }).eq("action", "residency.proof_viewed").eq("entity_id", securityId);

      const link = await api(`/api/admin/users/${securityId}/residency-proof?expected_version=${version}`, { headers: bearer(adminToken) });
      if (link.status !== 200) throw new Error(`Administrator proof link: expected 200, got ${link.status} ${link.body?.error ?? ""}`);
      if (link.body.expires_in !== 300 || link.body.kind !== "image") throw new Error(`Unexpected link details: ${JSON.stringify({ expires_in: link.body.expires_in, kind: link.body.kind })}`);
      const file = await fetch(link.body.url);
      if (!file.ok || !Buffer.from(await file.arrayBuffer()).equals(PNG)) throw new Error("The signed link did not return the uploaded proof");
      const auditsAfter = await db.from("activity_logs").select("*", { count: "exact", head: true }).eq("action", "residency.proof_viewed").eq("entity_id", securityId);
      if ((auditsAfter.count ?? 0) !== (auditsBefore.count ?? 0) + 1) throw new Error("Opening the proof did not add exactly one residency.proof_viewed audit");

      const stale = await api(`/api/admin/users/${securityId}/residency-proof?expected_version=${randomUUID()}`, { headers: bearer(adminToken) });
      if (stale.status !== 409) throw new Error(`A stale review version: expected 409, got ${stale.status}`);

      // Approve, so the next case runs as a verified resident under any reporting rule.
      const approved = await api(`/api/admin/users/${securityId}/residency`, {
        method: "PATCH",
        headers: bearer(adminToken),
        body: JSON.stringify({ decision: "verified", expected_version: version }),
      });
      if (approved.status !== 200) throw new Error(`Approval: expected 200, got ${approved.status} ${approved.body?.error ?? ""}`);
    });

    await runCase("IMP-13", "Feedback Rules", "a resolved report takes one rating: two at once give 201 and 409, a third gives 409", async () => {
      if (!securityToken) throw new Error("IMP-12 did not create the synthetic citizen");
      const groups = (await api("/api/reports/meta/problem-types", { headers: bearer(securityToken) })).body.groups as { category_id: number; problem_types: { id: number }[] }[];
      const problem = groups.find((group) => group.category_id === testCategory.id)?.problem_types[0];
      if (!problem) throw new Error(`No problem type for category ${testCategory.id}`);
      const created = await api("/api/reports", {
        method: "POST",
        headers: bearer(securityToken),
        body: JSON.stringify({ title: "[TEST] Security feedback check", description: "A report that is resolved to test one rating per report.", category_id: testCategory.id, primary_problem_id: problem.id, latitude: 14.5547, longitude: 121.0244 }),
      });
      if (created.status !== 201) throw new Error(`Report: expected 201, got ${created.status} ${created.body?.error ?? ""}`);
      const reportId = created.body.report.id as string;
      securityReportId = reportId;

      const { data: staff } = await db.from("profiles").select("id").eq("email", "fixture-staff-1@kamoti.invalid").single();
      for (const [path, body] of [
        [`/api/reports/${reportId}/assign`, { staff_id: staff!.id, details: "Security check crew." }],
        [`/api/reports/${reportId}/status`, { status: "under_review", details: "Checked the report." }],
        [`/api/reports/${reportId}/status`, { status: "in_progress", details: "Crew sent." }],
      ] as const) {
        const step = await api(path, { method: "PATCH", headers: bearer(adminToken), body: JSON.stringify(body) });
        if (!step.ok) throw new Error(`${path}: expected success, got ${step.status} ${step.body?.error ?? ""}`);
      }
      const photo = await multipart(`/api/reports/${reportId}/photos`, staff1Token, pngForm("photo"));
      if (photo.status !== 201) throw new Error(`Repair photo: expected 201, got ${photo.status}`);
      const request = await api(`/api/reports/${reportId}/closure-request`, {
        method: "POST",
        headers: bearer(staff1Token),
        body: JSON.stringify({ outcome: "resolved", details: "Repaired for the security check." }),
      });
      if (request.status !== 201) throw new Error(`Closure request: expected 201, got ${request.status} ${request.body?.error ?? ""}`);
      const workflow = await api(`/api/reports/${reportId}/workflow`, { headers: bearer(adminToken) });
      const review = await api(`/api/reports/${reportId}/closure-review`, {
        method: "POST",
        headers: bearer(adminToken),
        body: JSON.stringify({ decision: "approve", details: "Repair verified.", requested_at: workflow.body.workflow.closure.requested_at }),
      });
      if (review.status !== 200) throw new Error(`Closure approval: expected 200, got ${review.status} ${review.body?.error ?? ""}`);

      const rate = () => api(`/api/feedback/${reportId}`, { method: "POST", headers: bearer(securityToken), body: JSON.stringify({ rating: 5 }) });
      const both = (await Promise.all([rate(), rate()])).map((res) => res.status).sort();
      if (both.join() !== "201,409") throw new Error(`Two ratings at once: expected 201 and 409, got ${both.join(" and ")}`);
      const third = await rate();
      if (third.status !== 409) throw new Error(`A repeated rating: expected 409, got ${third.status}`);
      const saved = await count("report_feedback", "report_id", reportId);
      if (saved !== 1) throw new Error(`Expected one saved rating, found ${saved}`);
    });

    await runCase("IMP-17", "Residency Approval", "new reports and report photos wait for an administrator's approval, through an address change, a rejection, a refused damaged file (#62), and a re-upload of the same file (#59)", async () => {
      if (!securityReportId) throw new Error("IMP-13 did not create the synthetic citizen's report");
      const reportBody = JSON.stringify({ title: "[TEST] Refused before approval", description: "This report must not be saved.", category_id: testCategory.id, primary_problem_id: 1, latitude: 14.5547, longitude: 121.0244 });
      const version = async () => {
        const { data } = await db.from("profiles").select("residency_status, residency_review_version").eq("id", securityId).single();
        return data as { residency_status: string | null; residency_review_version: string };
      };
      const snapshot = async () => ({
        reports: await count("reports", "citizen_id", securityId),
        photos: await count("report_photos", "report_id", securityReportId),
        notifications: (await db.from("notifications").select("*", { count: "exact", head: true })).count ?? 0,
      });
      // The same session throughout: every request must read the current status.
      const expectRefused = async (code: string, step: string) => {
        const before = await snapshot();
        const report = await api("/api/reports", { method: "POST", headers: bearer(securityToken), body: reportBody });
        const photo = await multipart(`/api/reports/${securityReportId}/photos`, securityToken, pngForm("photo"));
        const photoCode = ((await photo.json()) as { details?: { code?: string } }).details?.code;
        if (report.status !== 403 || report.body?.details?.code !== code) throw new Error(`${step}, new report: expected 403 ${code}, got ${report.status} ${report.body?.details?.code}`);
        if (photo.status !== 403 || photoCode !== code) throw new Error(`${step}, photo: expected 403 ${code}, got ${photo.status} ${photoCode}`);
        const after = await snapshot();
        if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error(`${step}: refused writes changed records: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
      };

      const moved = await api("/api/auth/me", {
        method: "PATCH",
        headers: bearer(securityToken),
        body: JSON.stringify({ first_name: "Security", last_name: "Check", barangay: "Bel-Air", address_line: "2 Moved Street" }),
      });
      if (moved.status !== 200) throw new Error(`Address change: expected 200, got ${moved.status} ${moved.body?.error ?? ""}`);
      if ((await version()).residency_status !== "pending") throw new Error("An address change did not return the citizen to review");
      await expectRefused("residency_pending", "After an address change");
      const history = await api("/api/reports", { headers: bearer(securityToken) });
      if (history.status !== 200) throw new Error(`Report history while pending: expected 200, got ${history.status}`);

      const rejected = await api(`/api/admin/users/${securityId}/residency`, {
        method: "PATCH",
        headers: bearer(adminToken),
        body: JSON.stringify({ decision: "rejected", note: "The proof shows the old address.", expected_version: (await version()).residency_review_version }),
      });
      if (rejected.status !== 200) throw new Error(`Rejection: expected 200, got ${rejected.status} ${rejected.body?.error ?? ""}`);
      await expectRefused("residency_required", "After a rejection");

      // #62: a damaged file is refused on the proof field and changes nothing.
      const { data: beforeDamaged } = await db.from("profiles").select("residency_status, residency_note, residency_proof_id, residency_proof_path").eq("id", securityId).single();
      const damagedId = randomUUID();
      const damagedForm = new FormData();
      damagedForm.append("proof", new Blob([PNG.subarray(0, 40)], { type: "image/png" }), "proof.png");
      damagedForm.append("submission_id", damagedId);
      damagedForm.append("expected_version", (await version()).residency_review_version);
      const damaged = await multipart(`/api/auth/me/residency-proof?submission_id=${damagedId}`, securityToken, damagedForm);
      const damagedBody = (await damaged.json()) as { details?: { field: string }[] };
      if (damaged.status !== 400 || damagedBody.details?.[0]?.field !== "proof") throw new Error(`A damaged proof: expected 400 on the proof field, got ${damaged.status} ${JSON.stringify(damagedBody)}`);
      const { data: afterDamaged } = await db.from("profiles").select("residency_status, residency_note, residency_proof_id, residency_proof_path").eq("id", securityId).single();
      if (JSON.stringify(afterDamaged) !== JSON.stringify(beforeDamaged)) throw new Error(`A damaged proof changed the account: ${JSON.stringify(beforeDamaged)} -> ${JSON.stringify(afterDamaged)}`);
      const stored = await db.storage.from("residency-proofs").list(securityId);
      if ((stored.data ?? []).some((object) => object.name.startsWith(damagedId))) throw new Error("A damaged proof was stored");

      const submissionId = randomUUID();
      const reupload = await multipart(`/api/auth/me/residency-proof?submission_id=${submissionId}`, securityToken,
        pngForm("proof", { submission_id: submissionId, expected_version: (await version()).residency_review_version }));
      if (reupload.status !== 200) throw new Error(`Re-upload of the same file: expected 200, got ${reupload.status} ${await reupload.text()}`);
      if ((await version()).residency_status !== "pending") throw new Error("A re-upload did not leave the citizen awaiting review");
      await expectRefused("residency_pending", "After re-uploading the rejected file");

      const approved = await api(`/api/admin/users/${securityId}/residency`, {
        method: "PATCH",
        headers: bearer(adminToken),
        body: JSON.stringify({ decision: "verified", expected_version: (await version()).residency_review_version }),
      });
      if (approved.status !== 200) throw new Error(`Approval: expected 200, got ${approved.status} ${approved.body?.error ?? ""}`);
      // Past the gate: an empty report is refused for its fields, and a photo on the
      // resolved report for its status, neither for residency.
      const empty = await api("/api/reports", { method: "POST", headers: bearer(securityToken), body: "{}" });
      if (empty.status !== 400) throw new Error(`After approval, an empty report: expected 400, got ${empty.status} ${empty.body?.details?.code ?? ""}`);
      const late = await multipart(`/api/reports/${securityReportId}/photos`, securityToken, pngForm("photo"));
      const lateCode = ((await late.json()) as { details?: { code?: string } }).details?.code;
      if (late.status !== 403 || lateCode !== undefined) throw new Error(`After approval, a photo on a resolved report: expected 403 for its status, got ${late.status} ${lateCode}`);
    });

    await runCase("IMP-14", "Session Handling", "a deactivated citizen is refused with an old token, at sign-in, and on refresh", async () => {
      if (!securityToken) throw new Error("IMP-12 did not create the synthetic citizen");
      const off = await api(`/api/admin/users/${securityId}`, { method: "PATCH", headers: bearer(adminToken), body: JSON.stringify({ is_active: false }) });
      if (off.status !== 200) throw new Error(`Deactivation: expected 200, got ${off.status} ${off.body?.error ?? ""}`);
      for (const path of ["/api/auth/me", "/api/reports"]) {
        const res = await api(path, { headers: bearer(securityToken) });
        if (res.status !== 403) throw new Error(`${path} with the old token: expected 403, got ${res.status}`);
      }
      const login = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: securityEmail, password: securityPassword }) });
      if (login.status !== 403) throw new Error(`Sign-in: expected 403, got ${login.status}`);
      const refresh = await refreshWith(securityRefresh);
      if (refresh.ok) throw new Error(`Refresh still worked for a deactivated account (${refresh.status})`);
    });

    await runCase("IMP-15", "Residency Lock", "refused citizen writes save no report, photo, file, or notification", async () => {
      // Lock fixture citizen 2 as IMP-01 does; restored at once and in cleanup.
      const { data: profile } = await db.from("profiles").select("id, residency_status").eq("email", "fixture-citizen-2@kamoti.invalid").single();
      const original = profile!.residency_status as string | null;
      const restore = async () => {
        await db.from("profiles").update({ residency_status: original }).eq("id", profile!.id);
      };
      cleanups.push(restore);
      const ownReport = reportPendingCitizen2!.id;
      const snapshot = async () => ({
        reports: await count("reports", "citizen_id", profile!.id),
        photos: await count("report_photos", "report_id", ownReport),
        files: ((await db.storage.from("report-photos").list(ownReport)).data ?? []).length,
        notifications: (await db.from("notifications").select("*", { count: "exact", head: true })).count ?? 0,
      });
      await db.from("profiles").update({ residency_status: null }).eq("id", profile!.id);
      try {
        const token = await login("fixture-citizen-2@kamoti.invalid");
        const before = await snapshot();
        const report = await api("/api/reports", {
          method: "POST",
          headers: bearer(token),
          body: JSON.stringify({ title: "[TEST] Refused while locked", description: "This report must not be saved.", category_id: testCategory.id, primary_problem_id: 1, latitude: 14.5547, longitude: 121.0244 }),
        });
        if (report.status !== 403) throw new Error(`New report while locked: expected 403, got ${report.status}`);
        const photo = await multipart(`/api/reports/${ownReport}/photos`, token, pngForm("photo"));
        if (photo.status !== 403) throw new Error(`Photo while locked: expected 403, got ${photo.status}`);
        const after = await snapshot();
        if (JSON.stringify(after) !== JSON.stringify(before)) {
          throw new Error(`Refused writes changed saved records: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
        }
      } finally {
        await restore();
      }
    });

    // ------------------------------------------------------------------ Section A: Input Validation Live Check
    console.log("\n--- Section A: Input Validation Live Tests ---");

    await runCase("VAL-10", "Input Validation", "report submission with missing required fields returns 400", async () => {
      const res = await api("/api/reports", {
        method: "POST",
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: JSON.stringify({ title: "", description: "" }),
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (!Array.isArray(res.body.details) || res.body.details.length === 0) {
        throw new Error("Expected validation details array");
      }
    });
  } finally {
    console.log("\n--- Restoring Fixture State & Cleaning Temporary Test Data ---");
    for (const cleanup of cleanups.reverse()) {
      try {
        await cleanup();
      } catch (err: any) {
        console.error("Cleanup error:", err?.message || err);
      }
    }
    server.close();
    console.log("Integration test server stopped.\n");
  }

  // Summary Metrics Table
  console.log("======================================================");
  console.log("TEST RESULTS SUMMARY");
  console.log("======================================================");
  console.log("| ID       | Category               | Status | Duration |");
  console.log("| :------- | :--------------------- | :----- | :------- |");
  for (const r of results) {
    console.log(`| ${r.id.padEnd(8)} | ${r.category.padEnd(22)} | ${r.status.padEnd(6)} | ${r.durationMs.toString().padStart(6)}ms |`);
  }
  console.log("======================================================");

  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test execution error:", err);
  exit(1);
});
