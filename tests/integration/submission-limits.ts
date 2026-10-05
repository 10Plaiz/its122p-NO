import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { SQL } from "bun";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const config = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  TEST_DATABASE_URL: z.url(),
  SUBMISSION_TEST_PORT: z.coerce.number().int().min(1024).max(65533).default(56400),
}).parse(process.env);
for (const target of [config.SUPABASE_URL, config.TEST_DATABASE_URL]) {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(target).hostname), "Runtime tests require a local target");
}
assert.equal(new URL(config.SUPABASE_URL).protocol, "http:", "Use the disposable local Supabase HTTP endpoint");
assert.ok(["postgres:", "postgresql:"].includes(new URL(config.TEST_DATABASE_URL).protocol), "Use a local PostgreSQL connection");

const runId = randomUUID().slice(0, 8);
const password = `Runtime-${randomUUID()}!`;
const sql = new SQL(config.TEST_DATABASE_URL, { max: 4 });
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, clientOptions);
const actorSchema = z.object({ id: z.uuid(), token: z.string().min(1) });
type Actor = z.infer<typeof actorSchema>;
const reportSchema = z.object({ report: z.object({ id: z.uuid() }) });
const photoSchema = z.object({ photo: z.object({ storage_path: z.string().min(1), kind: z.enum(["initial", "resolution"]) }) });
const admissionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allowed") }).strict(),
  z.object({ kind: z.literal("limited"), operation: z.enum(["report", "photo", "proof"]), retry_after_seconds: z.number().int().positive().max(3600), retry_at: z.iso.datetime({ offset: true }) }).strict(),
]);
const limitedSchema = z.object({
  error: z.string().min(1),
  details: z.object({ code: z.literal("citizen_submission_limited"), operation: z.enum(["report", "photo", "proof"]), retry_after_seconds: z.number().int().positive().max(3600), retry_at: z.iso.datetime({ offset: true }) }).strict(),
});
const countSchema = z.array(z.object({ count: z.coerce.number().int().nonnegative() })).length(1);
const workers = new Set<ChildProcess>();
let category = { category_id: 0, primary_problem_id: 0 };
let sequence = 0;

async function actor(role: "citizen" | "staff" | "admin" = "citizen", residency: "verified" | "pending" = "verified"): Promise<Actor> {
  const email = `runtime-${runId}-${++sequence}@kamoti.invalid`;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { runtime_run: runId } });
  assert.equal(created.error, null, "Synthetic Auth account creation succeeds");
  const id = z.object({ id: z.uuid() }).parse(created.data.user).id;
  const profile = await db.from("profiles").insert({ id, email, name: `Runtime ${runId} ${sequence}`, role, is_active: true, residency_status: role === "citizen" ? residency : null });
  assert.equal(profile.error, null, "Synthetic profile creation succeeds");
  const auth = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, clientOptions);
  const signedIn = await auth.auth.signInWithPassword({ email, password });
  assert.equal(signedIn.error, null, "Real local Supabase Auth sign-in succeeds");
  return actorSchema.parse({ id, token: signedIn.data.session?.access_token });
}

async function start(port: number): Promise<ChildProcess> {
  const worker = spawn("node", ["--import", "tsx", "src/server/server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ...config, SUBMISSION_TEST_PORT: String(config.SUBMISSION_TEST_PORT), PORT: String(port), VERCEL: "0", DOTENV_CONFIG_PATH: "notes/nonexistent-runtime-env" },
    stdio: "ignore",
  });
  workers.add(worker);
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(worker.exitCode, null, "Independent Node API worker stays alive");
    try {
      const result = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.deepEqual(await result.json(), { status: "ok" });
      return worker;
    } catch {
      await delay(100);
    }
  }
  throw new Error("Independent Node API worker did not become healthy");
}

async function stop(worker: ChildProcess) {
  if (worker.exitCode !== null) return;
  const stopped = once(worker, "exit");
  worker.kill();
  await stopped;
  workers.delete(worker);
}

async function request(actor: Actor, path: string, body?: object | FormData, options: { port?: number; ipv6?: boolean; forwarded?: string; method?: string } = {}) {
  const headers = new Headers({ Authorization: `Bearer ${actor.token}` });
  if (options.forwarded) headers.set("X-Forwarded-For", options.forwarded);
  if (body && !(body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`http://${options.ipv6 ? "[::1]" : "127.0.0.1"}:${options.port ?? config.SUBMISSION_TEST_PORT}${path}`, {
    method: options.method ?? (body ? "POST" : "GET"), headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const value: unknown = await response.json();
  return { status: response.status, headers: response.headers, value };
}

function reportBody(label: string) {
  return { ...category, title: `[TEST] ${runId} ${label}`, description: "Synthetic quota runtime verification report.", latitude: 14.5547, longitude: 121.0244 };
}

async function multipart(field = "photo", invalid = false) {
  const form = new FormData();
  const bytes = invalid ? new Uint8Array(6 * 1024 * 1024) : new Uint8Array(await readFile("scripts/demo/assets/road-initial.png"));
  form.set(field, new Blob([bytes], { type: invalid ? "application/octet-stream" : "image/png" }), invalid ? "invalid.bin" : "synthetic.png");
  return form;
}

async function reportMultipart(label: string, invalid = false) {
  const form = await multipart("photo", invalid);
  for (const [key, value] of Object.entries(reportBody(label))) form.set(key, String(value));
  return form;
}

function limited(result: Awaited<ReturnType<typeof request>>, operation: "report" | "photo" | "proof") {
  assert.equal(result.status, 429, `${operation} request beyond its limit returns HTTP 429`);
  const value = limitedSchema.parse(result.value);
  assert.equal(value.details.operation, operation);
  assert.equal(result.headers.get("Retry-After"), String(value.details.retry_after_seconds));
  const remaining = Date.parse(value.details.retry_at) - Date.now();
  assert.ok(remaining > -1000 && remaining <= 3_600_000, "Retry time identifies a live trailing-hour deadline");
  assert.ok(Math.abs(remaining / 1000 - value.details.retry_after_seconds) < 3, "Retry header matches the deadline");
  return value.details;
}

async function admit(actor: Actor, network: string, action: string, client: SupabaseClient = db) {
  const result = await client.rpc("admit_citizen_operation", { p_actor_id: actor.id, p_network_key: network, p_action: action });
  assert.equal(result.error, null, "Real Data API admission RPC succeeds");
  return admissionSchema.parse(result.data);
}

async function countEvents(actor: Actor) {
  return countSchema.parse(await sql`select count(*) as count from public.citizen_submission_events where scope = 'account' and subject_key = ${actor.id}`)[0]?.count;
}

async function effects() {
  return z.array(z.object({ reports: z.coerce.number(), photos: z.coerce.number(), objects: z.coerce.number(), notifications: z.coerce.number() })).length(1).parse(await sql`
    select (select count(*) from public.reports) as reports,
      (select count(*) from public.report_photos) as photos,
      (select count(*) from storage.objects) as objects,
      (select count(*) from public.notifications) as notifications
  `)[0];
}

async function seedEvents(actor: Actor, operation: "report" | "photo" | "proof", count: number, remainingSeconds: number) {
  await sql`insert into public.citizen_submission_events(operation, scope, subject_key, admitted_at, expires_at)
    select ${operation}, 'account', ${actor.id}, deadline - interval '3600 seconds', deadline
    from (select clock_timestamp() + ${remainingSeconds} * interval '1 second' as deadline) timing,
      generate_series(1, ${count})`;
}

async function check(name: string, run: () => Promise<void>) {
  await run();
  console.log(`PASS ${name}`);
}

async function main() {
  const marker = z.array(z.object({ marker: z.string() })).length(1).parse(await sql`select current_setting('kamoti.test_database', true) as marker`);
  assert.equal(marker[0]?.marker, "disposable", "Database must already be approved and marked disposable");
  const privilege = z.array(z.object({ can_execute: z.boolean() })).length(1).parse(await sql`select has_function_privilege('service_role', 'public.admit_citizen_operation(uuid,text,text)', 'execute') as can_execute`);
  assert.equal(privilege[0]?.can_execute, true, "The migrated admission RPC is available to the server role");
  const problems = await db.from("problem_types").select("id,category_id").eq("is_active", true).order("id").limit(1);
  assert.equal(problems.error, null);
  const problem = z.array(z.object({ id: z.number().int().positive(), category_id: z.number().int().positive() })).length(1).parse(problems.data)[0];
  assert.ok(problem);
  category = { category_id: problem.category_id, primary_problem_id: problem.id };
  let firstWorker = await start(config.SUBMISSION_TEST_PORT);
  await start(config.SUBMISSION_TEST_PORT + 1);
  const admin = await actor("admin");
  const owner = await actor();
  let reportId = "";

  await check("Five real reports succeed across IPv4 and IPv6; the sixth returns retry metadata", async () => {
    for (let index = 0; index < 5; index++) {
      const result = await request(owner, "/api/reports", reportBody(`report ${index}`), { ipv6: index % 2 === 1 });
      assert.equal(result.status, 201);
      reportId = reportSchema.parse(result.value).report.id;
    }
    limited(await request(owner, "/api/reports", reportBody("blocked")), "report");
    assert.equal(await countEvents(owner), 5);
    const delivered = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", admin.id);
    assert.equal(delivered.error, null);
    assert.equal(delivered.count, 5, "Admitted reports deliver normal administrator notifications");
  });

  await check("Node process restart retains the exhausted account quota", async () => {
    await stop(firstWorker);
    firstWorker = await start(config.SUBMISSION_TEST_PORT);
    limited(await request(owner, "/api/reports", reportBody("after restart")), "report");
  });

  await check("Fifteen real photo uploads persist bytes; the sixteenth is rejected before Multer", async () => {
    for (let index = 0; index < 15; index++) {
      const result = await request(owner, `/api/reports/${reportId}/photos`, await multipart());
      assert.equal(result.status, 201);
      const photo = photoSchema.parse(result.value).photo;
      assert.equal(photo.kind, "initial");
      if (index === 0) {
        const object = await db.storage.from("report-photos").download(photo.storage_path);
        assert.equal(object.error, null);
        assert.ok(object.data);
        assert.deepEqual(new Uint8Array(await object.data.arrayBuffer()), new Uint8Array(await readFile("scripts/demo/assets/road-initial.png")));
      }
    }
    const before = await effects();
    limited(await request(owner, `/api/reports/${reportId}/photos`, await multipart("photo", true)), "photo");
    assert.deepEqual(await effects(), before, "Rejected upload creates no report, photo, object or notification");
  });

  await check("Three real residency proofs succeed; the fourth is rejected before Multer", async () => {
    const resident = await actor("citizen", "pending");
    for (let index = 0; index < 3; index++) assert.equal((await request(resident, "/api/auth/me/residency-proof", await multipart("proof"))).status, 200);
    const before = await effects();
    limited(await request(resident, "/api/auth/me/residency-proof", await multipart("proof", true)), "proof");
    assert.deepEqual(await effects(), before);
    assert.equal(await countEvents(resident), 3);
  });

  await check("Two independent Node workers admit exactly five concurrent reports", async () => {
    const concurrent = await actor();
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => request(concurrent, "/api/reports", reportBody(`concurrent ${index}`), { port: config.SUBMISSION_TEST_PORT + index % 2 })));
    assert.equal(results.filter((result) => result.status === 201).length, 5);
    for (const result of results.filter((result) => result.status !== 201)) limited(result, "report");
    assert.equal(await countEvents(concurrent), 5);
  });

  await check("Independent real Data API connections cannot over-admit one account across networks", async () => {
    const concurrent = await actor();
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => admit(concurrent, `runtime-${runId}-independent-${index}`, "report.create.json", createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, clientOptions))));
    assert.equal(results.filter((result) => result.kind === "allowed").length, 5);
    assert.equal(results.filter((result) => result.kind === "limited").length, 7);
    assert.equal(await countEvents(concurrent), 5);
  });

  await check("One network shares its fifty-report quota across eleven accounts and concurrent RPCs", async () => {
    const actors: Actor[] = [];
    for (let index = 0; index < 11; index++) actors.push(await actor());
    const network = `runtime-${runId}-shared-network`;
    for (const citizen of actors.slice(0, 9)) for (let index = 0; index < 5; index++) assert.deepEqual(await admit(citizen, network, "report.create.json"), { kind: "allowed" });
    const results = await Promise.all(actors.slice(9).flatMap((citizen) => Array.from({ length: 5 }, () => admit(citizen, network, "report.create.json", createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, clientOptions)))));
    assert.equal(results.filter((result) => result.kind === "allowed").length, 5);
    assert.equal(results.filter((result) => result.kind === "limited").length, 5);
    assert.equal(countSchema.parse(await sql`select count(*) as count from public.citizen_submission_events where scope = 'network' and subject_key = ${network}`)[0]?.count, 50);
  });

  await check("A limited multipart bundle consumes neither its report nor its photo allowance", async () => {
    const bundle = await actor();
    await seedEvents(bundle, "photo", 15, 3600);
    const before = await effects();
    limited(await request(bundle, "/api/reports", await reportMultipart("blocked bundle", true)), "photo");
    assert.equal(await countEvents(bundle), 15);
    assert.deepEqual(await effects(), before);
    assert.equal((await request(bundle, "/api/reports", reportBody("json after rejected bundle"))).status, 201);
    assert.equal(await countEvents(bundle), 16);
    const reportLimited = await actor();
    await seedEvents(reportLimited, "report", 5, 3600);
    limited(await request(reportLimited, "/api/reports", await reportMultipart("report limited bundle")), "report");
    assert.equal(await countEvents(reportLimited), 5);
    assert.deepEqual(await admit(reportLimited, `runtime-${runId}-bundle-photo`, "report.photo"), { kind: "allowed" });
  });

  await check("A real short wait reaches the database trailing-hour deadline and restores one slot", async () => {
    const recovering = await actor();
    await seedEvents(recovering, "report", 1, 2);
    await seedEvents(recovering, "report", 4, 3600);
    const blocked = limited(await request(recovering, "/api/reports", reportBody("before recovery")), "report");
    assert.ok(blocked.retry_after_seconds <= 2, "Retry is based on the first expiring live admission");
    await delay(Math.max(0, Date.parse(blocked.retry_at) - Date.now()) + 150);
    assert.equal((await request(recovering, "/api/reports", reportBody("after recovery"))).status, 201);
    limited(await request(recovering, "/api/reports", reportBody("recovered slot used")), "report");
  });

  await check("Forwarded headers cannot divide the network quota on the local API", async () => {
    const spoof = await actor();
    for (const forwarded of ["198.51.100.1", "198.51.100.2"]) assert.equal((await request(spoof, "/api/reports", reportBody(`spoof ${forwarded}`), { forwarded })).status, 201);
    const rows = z.array(z.object({ subject_key: z.string() })).parse(await sql`
      select distinct subject_key from public.citizen_submission_events
      where operation = 'report' and scope = 'network' and admitted_at in (
        select admitted_at from public.citizen_submission_events where scope = 'account' and subject_key = ${spoof.id})`);
    assert.deepEqual(rows, [{ subject_key: "127.0.0.1" }]);
  });

  await check("A real database lock timeout refuses before writes and recovers after release", async () => {
    const locked = await actor();
    const before = await effects();
    await sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(
        'kamoti:citizen-admission:report:account:' || ${locked.id}, 0))`;
      const started = performance.now();
      const result = await request(locked, "/api/reports", reportBody("locked store"));
      const elapsed = performance.now() - started;
      assert.equal(result.status, 503);
      assert.equal(result.headers.get("Retry-After"), "60");
      assert.ok(elapsed >= 1500 && elapsed < 5500, "The real PostgREST lock wait is bounded");
      assert.deepEqual(await effects(), before);
      assert.equal(await countEvents(locked), 0);
    });
    assert.equal((await request(locked, "/api/reports", reportBody("lock released"))).status, 201);
  });

  await check("Ownership and staff/admin photo permissions still apply without citizen quotas", async () => {
    const other = await actor();
    const staff = await actor("staff");
    const unassigned = await actor("staff");
    assert.equal((await request(other, `/api/reports/${reportId}/photos`, await multipart())).status, 403);
    assert.equal(await countEvents(other), 0, "Ownership rejection does not consume quota");
    const assigned = await db.from("reports").update({ assigned_staff_id: staff.id }).eq("id", reportId);
    assert.equal(assigned.error, null);
    assert.equal((await request(unassigned, `/api/reports/${reportId}/photos`, await multipart())).status, 403);
    for (const allowed of [staff, admin]) {
      const result = await request(allowed, `/api/reports/${reportId}/photos`, await multipart());
      assert.equal(result.status, 201);
      assert.equal(photoSchema.parse(result.value).photo.kind, "resolution");
      assert.equal(await countEvents(allowed), 0);
      assert.equal((await request(allowed, "/api/reports", reportBody("role denied"))).status, 403);
    }
  });

  await check("RPC failure closes all citizen write paths with HTTP 503 and no side effects", async () => {
    const unavailable = await actor("citizen", "pending");
    const available = await actor();
    const created = await request(available, "/api/reports", reportBody("failure target"));
    assert.equal(created.status, 201);
    const id = reportSchema.parse(created.value).report.id;
    const before = await effects();
    await sql`revoke execute on function public.admit_citizen_operation(uuid,text,text) from service_role`;
    try {
      for (const input of [
        { citizen: available, path: "/api/reports", form: await reportMultipart("unavailable", true) },
        { citizen: available, path: `/api/reports/${id}/photos`, form: await multipart("photo", true) },
        { citizen: unavailable, path: "/api/auth/me/residency-proof", form: await multipart("proof", true) },
      ]) {
        const result = await request(input.citizen, input.path, input.form);
        assert.equal(result.status, 503);
        assert.equal(result.headers.get("Retry-After"), "60");
        z.object({ error: z.string(), details: z.object({ code: z.literal("citizen_submission_unavailable"), retry_after_seconds: z.literal(60), retry_at: z.iso.datetime({ offset: true }) }) }).parse(result.value);
      }
      assert.deepEqual(await effects(), before);
      assert.equal(await countEvents(unavailable), 0);
      assert.equal(await countEvents(available), 1);
    } finally {
      await sql`grant execute on function public.admit_citizen_operation(uuid,text,text) to service_role`;
    }
    assert.equal((await request(available, "/api/reports", reportBody("RPC restored"))).status, 201);
  });
  console.log(`Runtime submission checks passed. Synthetic records for run ${runId} were retained.`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Runtime verification failed");
  process.exitCode = 1;
} finally {
  for (const worker of workers) await stop(worker);
  await sql.close();
}
