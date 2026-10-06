import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { SQL } from "bun";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect, type Browser, type Page } from "@playwright/test";
import { z } from "zod";
import { captureEvidence, placePinByLocation, signIn } from "../browser/helpers.js";

const config = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  TEST_DATABASE_URL: z.url(),
  PLAYWRIGHT_BASE_URL: z.url().default("http://localhost:5173"),
}).parse(process.env);
for (const target of [config.SUPABASE_URL, config.TEST_DATABASE_URL, config.PLAYWRIGHT_BASE_URL]) {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(target).hostname), "Browser quota checks require local targets");
}
assert.equal(new URL(config.SUPABASE_URL).protocol, "http:");
assert.ok(["postgres:", "postgresql:"].includes(new URL(config.TEST_DATABASE_URL).protocol));

const sql = new SQL(config.TEST_DATABASE_URL, { max: 1 });
const db = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().slice(0, 8);
const password = `Browser-${randomUUID()}!`;
const evidenceFolder = "submission-limits-2026-10-05";
const photoPath = "scripts/demo/assets/road-initial.png";
const failureSchema = z.object({ details: z.object({ retry_after_seconds: z.number().int().positive(), retry_at: z.iso.datetime({ offset: true }) }) });
let browser: Browser | undefined;
let actorNumber = 0;

async function actor(residency_status: "verified" | "pending") {
  const email = `quota-browser-${runId}-${++actorNumber}@kamoti.invalid`;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null);
  const { id } = z.object({ id: z.uuid() }).parse(created.data.user);
  const profile = await db.from("profiles").insert({ id, email, name: "Quota browser check", role: "citizen", is_active: true, residency_status });
  assert.equal(profile.error, null);
  return { id, email };
}

async function seedQuota(id: string, operation: "report" | "proof", count: number, remainingSeconds: number) {
  await sql`insert into public.citizen_submission_events(operation, scope, subject_key, admitted_at, expires_at)
    select ${operation}, 'account', ${id}, deadline - interval '3600 seconds', deadline
    from (select clock_timestamp() + ${remainingSeconds} * interval '1 second' as deadline) timing, generate_series(1, ${count})`;
}

async function effects() {
  return await sql`select
    (select count(*) from public.reports) as reports,
    (select count(*) from public.report_photos) as photos,
    (select count(*) from storage.objects) as objects,
    (select count(*) from public.notifications) as notifications`;
}

async function session(page: Page) {
  return page.evaluate(() => localStorage.getItem("kamoti.token"));
}

async function fillReport(page: Page, title: string) {
  await page.goto("/report/new");
  await placePinByLocation(page);
  await page.locator("#address").fill("Ayala Avenue, Makati");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#category").selectOption({ index: 1 });
  await expect(page.locator("#primary-problem option")).not.toHaveCount(1);
  await page.locator("#primary-problem").selectOption({ index: 1 });
  await page.locator("#title").fill(title);
  await page.locator("#description").fill("A damaged road surface on Ayala Avenue needs repair.");
  const category = await page.locator("#category").inputValue();
  const problem = await page.locator("#primary-problem").inputValue();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  return { category, problem };
}

async function refusal(page: Page, path: string, button: string, status: number) {
  const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === `/api${path}` && response.request().method() === "POST");
  await page.getByRole("button", { name: button, exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), status);
  const details = failureSchema.parse(await response.json()).details;
  assert.equal(response.headers()["retry-after"], String(details.retry_after_seconds));
  await expect(page.getByRole("alert")).toContainText("Try again after");
  return { response, details };
}

async function assertFile(page: Page, id: string) {
  assert.equal(await page.locator(`#${id}`).evaluate((input) => (input as HTMLInputElement).files?.[0]?.name), "road-initial.png");
  await expect(page.getByRole("img", { name: "Preview of road-initial.png" })).toBeVisible();
}

async function assertLayout(page: Page) {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  assert.ok(size.scroll <= size.client + 1, "No horizontal page overflow");
}

async function pageFor(width: number, height: number) {
  assert.ok(browser);
  const context = await browser.newContext({ baseURL: config.PLAYWRIGHT_BASE_URL, viewport: { width, height } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/^Failed to load resource: the server responded with a status of (429|503)\b/.test(message.text())) errors.push(message.text());
  });
  return { context, page, errors };
}

async function main() {
  const [marker] = await sql`select current_setting('kamoti.test_database', true) as marker`;
  assert.equal(marker?.marker, "disposable", "Use an already approved disposable database");
  const [privilege] = await sql`select has_function_privilege('service_role', 'public.admit_citizen_operation(uuid,text,text,uuid)', 'execute') as can_execute`;
  assert.equal(privilege?.can_execute, true);
  const ready = await fetch(new URL("/api/health", config.PLAYWRIGHT_BASE_URL));
  assert.equal(ready.status, 200, "Start the real API and Vite servers first");
  assert.deepEqual(await ready.json(), { status: "ok" }, "Start the real API and Vite servers first");
  await mkdir(`${process.env.EVIDENCE_DIR ?? "tests/evidence"}/${evidenceFolder}`, { recursive: true });
  browser = await chromium.launch();

  const citizen = await actor("verified");
  const mobile = await pageFor(375, 812);
  await signIn(mobile.page, citizen.email, password);
  const token = await session(mobile.page);
  assert.ok(token);
  const title = `[TEST] ${runId} Retained road report`;
  const values = await fillReport(mobile.page, title);
  await mobile.page.locator("#photo").setInputFiles(photoPath);
  await assertFile(mobile.page, "photo");
  await captureEvidence(mobile.page, `${evidenceFolder}/report-before-mobile.png`);
  await seedQuota(citizen.id, "report", 5, 10);
  const before = await effects();
  const { details } = await refusal(mobile.page, "/reports", "Submit report", 429);
  assert.deepEqual(await effects(), before, "Refused report has no report, file, photo, or notification write");
  assert.equal(await session(mobile.page), token);
  await expect(mobile.page.getByTestId("preflight-summary")).toContainText(title);
  await expect(mobile.page.getByTestId("preflight-summary")).toContainText("A damaged road surface on Ayala Avenue needs repair.");
  await expect(mobile.page.getByTestId("preflight-summary")).toContainText("Ayala Avenue, Makati");
  await assertFile(mobile.page, "photo");
  await assertLayout(mobile.page);
  await captureEvidence(mobile.page, `${evidenceFolder}/report-limited-mobile.png`);
  await mobile.page.locator("nav[aria-label='Wizard steps'] button").nth(1).click();
  await expect(mobile.page.locator("#title")).toHaveValue(title);
  await expect(mobile.page.locator("#description")).toHaveValue("A damaged road surface on Ayala Avenue needs repair.");
  await expect(mobile.page.locator("#category")).toHaveValue(values.category);
  await expect(mobile.page.locator("#primary-problem")).toHaveValue(values.problem);
  await mobile.page.locator("nav[aria-label='Wizard steps'] button").nth(0).click();
  await expect(mobile.page.getByTestId("selected-coordinates")).toContainText("14.55470");
  await mobile.page.locator("nav[aria-label='Wizard steps'] button").nth(2).click();
  await expect(mobile.page.getByRole("img", { name: "Preview of road-initial.png" })).toBeVisible();
  await delay(Math.max(0, Date.parse(details.retry_at) - Date.now() + 1100));
  const successPromise = mobile.page.waitForResponse((response) => response.url().endsWith("/api/reports") && response.request().method() === "POST");
  await mobile.page.getByRole("button", { name: "Submit report", exact: true }).click();
  const filed = await successPromise;
  assert.equal(filed.status(), 201);
  const { report } = z.object({ report: z.object({ id: z.uuid() }) }).parse(await filed.json());
  const photos = await db.from("report_photos").select("storage_path").eq("report_id", report.id).single();
  assert.equal(photos.error, null);
  const photo = z.object({ storage_path: z.string().min(1) }).parse(photos.data);
  const image = await db.storage.from("report-photos").download(photo.storage_path);
  assert.equal(image.error, null);
  assert.ok(image.data);
  assert.deepEqual(new Uint8Array(await image.data.arrayBuffer()), new Uint8Array(await readFile(photoPath)));
  await expect(mobile.page).toHaveURL(/\/reports\/[a-f0-9-]+$/);
  await expect(mobile.page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(mobile.page.getByRole("img", { name: /^Evidence photo 1 for report / })).toBeVisible();
  assert.deepEqual(mobile.errors, []);
  console.log("PASS Live 429 keeps report text, category, location, photo, and session; manual retry files the retained photo");

  await fillReport(mobile.page, `[TEST] ${runId} JSON report without a photo`);
  const jsonPromise = mobile.page.waitForResponse((response) => response.url().endsWith("/api/reports") && response.request().method() === "POST");
  await mobile.page.getByRole("button", { name: "Submit report", exact: true }).click();
  const json = await jsonPromise;
  assert.equal(json.status(), 201);
  assert.match(json.request().headers()["content-type"] ?? "", /^application\/json/);
  const [photoEvents] = await sql`select count(*)::integer as count from public.citizen_submission_events where scope = 'account' and subject_key = ${citizen.id} and operation = 'photo'`;
  assert.equal(photoEvents?.count, 1, "The photo-free browser report consumes no photo allowance");
  await expect(mobile.page).toHaveURL(/\/reports\/[a-f0-9-]+$/);
  assert.deepEqual(mobile.errors, []);
  console.log("PASS A photo-free browser report uses JSON and consumes only report allowance");
  await mobile.context.close();

  const proofActor = await actor("pending");
  const desktop = await pageFor(1280, 800);
  await signIn(desktop.page, proofActor.email, password);
  await expect(desktop.page).toHaveURL(/\/register\?step=proof$/);
  const proofToken = await session(desktop.page);
  await desktop.page.locator("#proof").setInputFiles(photoPath);
  await seedQuota(proofActor.id, "proof", 3, 3600);
  const beforeProof = await effects();
  await refusal(desktop.page, "/auth/me/residency-proof", "Send proof", 429);
  assert.deepEqual(await effects(), beforeProof);
  await assertFile(desktop.page, "proof");
  assert.equal(await session(desktop.page), proofToken);
  await assertLayout(desktop.page);
  await captureEvidence(desktop.page, `${evidenceFolder}/proof-limited-desktop.png`);
  const dialogPromise = desktop.page.waitForEvent("dialog");
  const reloadPromise = desktop.page.evaluate(() => window.location.reload());
  const dialog = await dialogPromise;
  assert.equal(dialog.type(), "beforeunload");
  await dialog.dismiss();
  await reloadPromise;
  await assertFile(desktop.page, "proof");
  assert.deepEqual(desktop.errors, []);
  console.log("PASS Live proof 429 keeps the selected file and session; reload prompts before losing the file");
  await desktop.context.close();

  const outageActor = await actor("pending");
  const outage = await pageFor(375, 812);
  await signIn(outage.page, outageActor.email, password);
  const outageToken = await session(outage.page);
  await outage.page.locator("#proof").setInputFiles(photoPath);
  const beforeOutage = await effects();
  try {
    await sql`revoke execute on function public.admit_citizen_operation(uuid,text,text,uuid) from service_role`;
    await refusal(outage.page, "/auth/me/residency-proof", "Send proof", 503);
    assert.deepEqual(await effects(), beforeOutage);
    assert.equal(await session(outage.page), outageToken);
    await assertFile(outage.page, "proof");
    await assertLayout(outage.page);
    await captureEvidence(outage.page, `${evidenceFolder}/proof-unavailable-mobile.png`);
  } finally {
    await sql`grant execute on function public.admit_citizen_operation(uuid,text,text,uuid) to service_role`;
  }
  const proofPromise = outage.page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/me/residency-proof" && response.request().method() === "POST");
  await outage.page.getByRole("button", { name: "Send proof", exact: true }).click();
  const proof = await proofPromise;
  assert.equal(proof.status(), 200);
  const result = z.object({ user: z.object({ has_residency_proof: z.literal(true) }) }).parse(await proof.json());
  assert.ok(result.user.has_residency_proof);
  await expect(outage.page).not.toHaveURL(/\/register\?step=proof$/);
  const profile = await db.from("profiles").select("residency_proof_path").eq("id", outageActor.id).single();
  assert.equal(profile.error, null);
  const path = z.object({ residency_proof_path: z.string().min(1) }).parse(profile.data).residency_proof_path;
  const stored = await db.storage.from("residency-proofs").download(path);
  assert.equal(stored.error, null);
  assert.ok(stored.data);
  assert.deepEqual(new Uint8Array(await stored.data.arrayBuffer()), new Uint8Array(await readFile(photoPath)));
  assert.deepEqual(outage.errors, []);
  console.log("PASS Live 503 keeps proof and retry guidance; restored RPC accepts the same file and stores its bytes");
  await outage.context.close();
  console.log(`Browser submission checks passed. Synthetic records for run ${runId} were retained.`);
}

try {
  await main();
} finally {
  await browser?.close();
  await sql.close();
}
