// KAMOTI Phase 4 Security Integration Test Suite
//
// Verifies real Express API routes against the linked development Supabase project
// using synthetic fixture accounts (fixture-*@kamoti.invalid).
//
// Safety contract:
// - Refuses to run unless --target names the configured Supabase project.
// - Requires fixture password via --password, FIXTURE_PASSWORD env, or piped stdin / prompt.
// - Never prints secrets, access tokens, or credentials.
// - Restores fixture report states and cleans up temporary test records.

import "dotenv/config";
import type { Server } from "node:http";
import { createInterface } from "node:readline";
import { stdin, exit } from "node:process";
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
      
      const res = await api("/api/reports", {
        method: "POST",
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: JSON.stringify({
          title: xssTitle,
          description: xssDescription,
          category_id: testCategory.id,
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
