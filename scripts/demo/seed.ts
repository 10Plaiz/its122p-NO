import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DEMO_DATASET as DATASET, generateSeed } from "./generate_seed.js";

const directory = resolve(".seed");
const privateDirectory = resolve(homedir(), ".local/share/kamoti/demo-seeds");
const manifestPath = resolve(directory, `${DATASET}.json`);
const assetDirectory = resolve("scripts/demo/assets");
const rowSchema = z.record(z.string(), z.unknown());
type Row = z.infer<typeof rowSchema>;
type Manifest = ReturnType<typeof generateSeed>;
function connect(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
type Client = ReturnType<typeof connect>;

export function digest(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(canonical);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
    }
    return input;
  }
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function checkTarget(url: string, target: string | undefined): void {
  if (!target || new URL(url).origin !== `https://${target}.supabase.co`) {
    throw new Error("--target must match the project in SUPABASE_URL exactly.");
  }
}

export function validateManifest(input: unknown): Manifest {
  const config = z.object({ dataset: z.literal(DATASET), seed: z.number().int(), asOf: z.string() }).parse(input);
  const expected = generateSeed(config);
  if (digest(input) !== digest(expected)) throw new Error("Manifest differs from the generator. Regenerate and review it before applying.");
  return expected;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function selected(db: Client, table: string, ids: string[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (let start = 0; start < ids.length; start += 60) {
    const result = await db.from(table).select("*").in("id", ids.slice(start, start + 60));
    fail(result.error);
    rows.push(...z.array(rowSchema).parse(result.data));
  }
  return rows;
}

async function snapshot(db: Client): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (const table of ["profiles", "categories", "reports", "report_updates", "notifications", "report_photos", "activity_logs", "report_inspections"]) {
    for (let offset = 0; ; offset += 500) {
      const result = await db.from(table).select("*").order("id").range(offset, offset + 499);
      fail(result.error);
      const rows = z.array(rowSchema).parse(result.data);
      for (const row of rows) hashes.set(`${table}:${row.id}`, digest(row));
      if (rows.length < 500) break;
    }
  }
  return hashes;
}

function assertPreserved(before: Map<string, string>, after: Map<string, string>) {
  for (const [key, hash] of before) {
    if (after.get(key) !== hash) throw new Error(`Existing row changed during this run: ${key}. Inspect concurrent activity before continuing.`);
  }
  console.log(`Verified ${before.size} existing application rows remained unchanged.`);
}

export function missingRows(planned: Row[], existing: Row[]): Row[] {
  const ids = new Set(existing.map(row => String(row.id)));
  return planned.filter(row => !ids.has(String(row.id)));
}

async function insertMissing(db: Client, table: string, rows: Row[]): Promise<void> {
  for (let start = 0; start < rows.length; start += 60) {
    const result = await db.from(table).upsert(rows.slice(start, start + 60), { onConflict: "id", ignoreDuplicates: true });
    fail(result.error);
  }
}

async function authUsers(db: Client) {
  const users = [];
  for (let page = 1; ; page++) {
    const result = await db.auth.admin.listUsers({ page, perPage: 100 });
    fail(result.error);
    users.push(...result.data.users);
    if (result.data.users.length < 100) return users;
  }
}

async function assets(manifest: Manifest) {
  const result = new Map<string, Buffer>();
  for (const name of new Set(manifest.reports.flatMap(report => report.photos.map(photo => photo.asset)))) {
    if (!/^(road|streetlight|drainage|signage|sidewalk|other)-(initial|resolution)\.png$/.test(name)) throw new Error("Invalid asset filename.");
    const bytes = await readFile(resolve(assetDirectory, name));
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`Invalid PNG: ${name}`);
    result.set(name, bytes);
  }
  return result;
}

async function preflight(db: Client, manifest: Manifest, fingerprint: string) {
  const probe = await db.from("public_reports").select("category_id").limit(0);
  fail(probe.error);
  const bucket = await db.storage.getBucket("report-photos");
  fail(bucket.error);
  if (!bucket.data?.public) throw new Error("report-photos must be the existing public bucket.");
  const categories = await db.from("categories").select("id,name,is_active");
  fail(categories.error);
  const categoryRows = z.array(z.object({ id: z.number(), name: z.string(), is_active: z.boolean() })).parse(categories.data);
  for (const name of new Set(manifest.reports.map(report => report.category))) {
    if (!categoryRows.some(row => row.name === name && row.is_active)) throw new Error(`Missing active category: ${name}`);
  }
  const users = await authUsers(db);
  const accountIds = new Map<string, string>();
  for (const account of manifest.accounts) {
    const user = users.find(user => user.email?.toLowerCase() === account.email.toLowerCase());
    if (!user) continue;
    if (user.app_metadata.demo_dataset !== DATASET || user.app_metadata.demo_digest !== fingerprint || user.app_metadata.demo_account !== account.key) {
      throw new Error(`Account collision or changed dataset configuration: ${account.email}. No existing accounts will be altered.`);
    }
    accountIds.set(account.key, user.id);
  }
  const profiles = await selected(db, "profiles", [...accountIds.values()]);
  for (const account of manifest.accounts) {
    const profile = profiles.find(row => row.id === accountIds.get(account.key));
    if (profile && (profile.email !== account.email || profile.role !== account.role)) throw new Error(`Demo profile changed: ${account.key}. Review before resuming.`);
  }
  const tables = {
    reports: await selected(db, "reports", manifest.reports.map(report => report.id)),
    report_updates: await selected(db, "report_updates", manifest.reports.flatMap(report => report.updates.map(update => update.id))),
    notifications: await selected(db, "notifications", manifest.reports.flatMap(report => report.notifications.map(notice => notice.id))),
    report_photos: await selected(db, "report_photos", manifest.reports.flatMap(report => report.photos.map(photo => photo.id))),
  };
  for (const report of manifest.reports) {
    const existing = tables.reports.find(row => row.id === report.id);
    if (existing && existing.citizen_id !== accountIds.get(report.ownerKey)) throw new Error(`Report ID ownership mismatch: ${report.id}`);
    for (const [table, children] of [["report_updates", report.updates], ["notifications", report.notifications], ["report_photos", report.photos]] as const) {
      for (const child of children) {
        const row = tables[table].find(row => row.id === child.id);
        if (row && row.report_id !== report.id) throw new Error(`Child ID ownership mismatch: ${child.id}`);
      }
    }
    for (const update of report.updates) {
      const row = tables.report_updates.find(row => row.id === update.id);
      if (row && (row.updated_by !== accountIds.get(update.actorKey) || row.update_type !== update.update_type || row.details !== update.details || row.previous_status !== update.previous_status || row.new_status !== update.new_status)) {
        throw new Error(`Seed history changed: ${update.id}. Review before resuming.`);
      }
    }
    for (const notice of report.notifications) {
      const row = tables.notifications.find(row => row.id === notice.id);
      if (row && (row.user_id !== accountIds.get(notice.userKey) || row.message !== notice.message)) throw new Error(`Seed notification ownership or content changed: ${notice.id}`);
    }
    for (const photo of report.photos) {
      const row = tables.report_photos.find(row => row.id === photo.id);
      if (row && (row.uploaded_by !== accountIds.get(photo.uploadedByKey) || row.kind !== photo.kind || row.storage_path !== `${DATASET}/${photo.asset}`)) throw new Error(`Seed photo ownership or path changed: ${photo.id}`);
    }
  }
  const logResult = await db.from("activity_logs").select("entity_id,metadata").eq("action", "demo.report_seeded").contains("metadata", { dataset: DATASET });
  fail(logResult.error);
  const logs = z.array(rowSchema).parse(logResult.data);
  if (logs.some(row => z.object({ fingerprint: z.string() }).parse(row.metadata).fingerprint !== fingerprint)) throw new Error("Existing seed audit records have a different fingerprint.");
  return { accountIds, profiles, categoryRows, tables, logs };
}

type State = Awaited<ReturnType<typeof preflight>>;

function summary(manifest: Manifest, state: State) {
  return {
    dataset: DATASET,
    existingAccounts: state.accountIds.size,
    createAccounts: manifest.accounts.length - state.accountIds.size,
    createProfiles: manifest.accounts.length - state.profiles.length,
    createReports: manifest.reports.length - state.tables.reports.length,
    createUpdates: manifest.reports.reduce((n, report) => n + report.updates.length, 0) - state.tables.report_updates.length,
    createNotifications: manifest.reports.reduce((n, report) => n + report.notifications.length, 0) - state.tables.notifications.length,
    createPhotoRows: manifest.reports.reduce((n, report) => n + report.photos.length, 0) - state.tables.report_photos.length,
    createAuditRows: manifest.reports.filter(report => !state.logs.some(log => log.entity_id === report.id)).length,
  };
}

async function credentials(target: string, manifest: Manifest, hasAccounts: boolean) {
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  await chmod(privateDirectory, 0o700);
  if (((await stat(privateDirectory)).mode & 0o077) !== 0) throw new Error("The credentials directory must enforce private filesystem permissions.");
  const path = resolve(privateDirectory, `credentials-${target}.json`);
  try {
    const stored = z.object({ target: z.literal(target), dataset: z.literal(DATASET), password: z.string().min(16).max(72) }).parse(JSON.parse(await readFile(path, "utf8")));
    await chmod(path, 0o600);
    if (((await stat(path)).mode & 0o077) !== 0) throw new Error("The credentials file must enforce private filesystem permissions.");
    return stored.password;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    if (hasAccounts) throw new Error("Restore the private credentials file before resuming account creation. Existing passwords will not be reset.");
    const password = process.env.DEMO_PASSWORD ?? `Km!${randomBytes(24).toString("base64url")}`;
    z.string().min(16).max(72).parse(password);
    await writeFile(path, JSON.stringify({ target, dataset: DATASET, password, accounts: manifest.accounts.map(({ email, role }) => ({ email, role })) }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    if (((await stat(path)).mode & 0o077) !== 0) throw new Error("The credentials file must enforce private filesystem permissions.");
    return password;
  }
}

function accountId(state: State, key: string): string {
  const id = state.accountIds.get(key);
  if (!id) throw new Error(`Missing account: ${key}`);
  return id;
}

async function uploadAssets(db: Client, files: Map<string, Buffer>) {
  for (const [name, bytes] of files) {
    const path = `${DATASET}/${name}`;
    const existing = await db.storage.from("report-photos").list(DATASET, { search: name });
    fail(existing.error);
    if (existing.data?.some(file => file.name === name)) {
      const download = await db.storage.from("report-photos").download(path);
      fail(download.error);
      if (!download.data || !Buffer.from(await download.data.arrayBuffer()).equals(bytes)) throw new Error(`Existing image differs: ${path}`);
    } else {
      const result = await db.storage.from("report-photos").upload(path, bytes, { contentType: "image/png", upsert: false });
      fail(result.error);
    }
  }
}

async function apply(db: Client, manifest: Manifest, state: State, fingerprint: string, files: Map<string, Buffer>, target: string) {
  const password = state.accountIds.size < manifest.accounts.length ? await credentials(target, manifest, state.accountIds.size > 0) : null;
  for (const account of manifest.accounts) {
    if (state.accountIds.has(account.key)) continue;
    if (!password) throw new Error("Missing account password.");
    const result = await db.auth.admin.createUser({ email: account.email, password, email_confirm: true,
      app_metadata: { demo_dataset: DATASET, demo_digest: fingerprint, demo_account: account.key } });
    fail(result.error);
    if (!result.data.user) throw new Error(`Could not create ${account.key}`);
    state.accountIds.set(account.key, result.data.user.id);
  }
  const profiles = manifest.accounts.map(account => ({ id: accountId(state, account.key), email: account.email, name: account.name, role: account.role, contact_number: null, created_at: account.created_at, updated_at: account.created_at }));
  await insertMissing(db, "profiles", missingRows(profiles, state.profiles));
  await uploadAssets(db, files);
  const reports = manifest.reports.map(report => {
    const category = state.categoryRows.find(row => row.name === report.category);
    if (!category) throw new Error(`Missing category: ${report.category}`);
    return { id: report.id, citizen_id: accountId(state, report.ownerKey), assigned_staff_id: report.staffKey ? accountId(state, report.staffKey) : null,
      category_id: category.id, title: report.title, description: report.description, latitude: report.latitude, longitude: report.longitude,
      address_text: report.address_text, status: report.status, is_public: report.is_public, submitted_at: report.submitted_at, updated_at: report.updated_at, resolved_at: report.resolved_at };
  });
  await insertMissing(db, "reports", missingRows(reports, state.tables.reports));
  const updates = manifest.reports.flatMap(report => report.updates.map(({ actorKey, ...update }) => ({ ...update, report_id: report.id, updated_by: accountId(state, actorKey) })));
  const notices = manifest.reports.flatMap(report => report.notifications.map(({ userKey, ...notice }) => ({ ...notice, report_id: report.id, user_id: accountId(state, userKey) })));
  const photos = manifest.reports.flatMap(report => report.photos.map(({ uploadedByKey, asset, ...photo }) => ({ ...photo, report_id: report.id, uploaded_by: accountId(state, uploadedByKey), storage_path: `${DATASET}/${asset}` })));
  await insertMissing(db, "report_updates", missingRows(updates, state.tables.report_updates));
  await insertMissing(db, "notifications", missingRows(notices, state.tables.notifications));
  await insertMissing(db, "report_photos", missingRows(photos, state.tables.report_photos));
  const audit = manifest.reports.filter(report => !state.logs.some(log => log.entity_id === report.id)).map(report => ({ actor_id: accountId(state, "admin"), action: "demo.report_seeded", entity_type: "report", entity_id: report.id,
    metadata: { dataset: DATASET, fingerprint, synthetic: true }, created_at: new Date().toISOString() }));
  if (audit.length) {
    const result = await db.from("activity_logs").insert(audit);
    fail(result.error);
  }
}

async function verify(db: Client, manifest: Manifest, state: State, files: Map<string, Buffer>) {
  const pending = summary(manifest, state);
  if (Object.entries(pending).some(([key, value]) => key.startsWith("create") && value !== 0)) throw new Error(`Incomplete seed: ${JSON.stringify(pending)}`);
  const ids = new Set(manifest.reports.map(report => report.id));
  const publicRows = await selected(db, "public_reports", [...ids]);
  const publicIds = new Set(publicRows.map(row => row.id));
  for (const report of state.tables.reports) {
    const expectedPublic = report.is_public === true && report.status !== "cancelled";
    if (publicIds.has(report.id) !== expectedPublic) throw new Error(`Public visibility mismatch: ${report.id}`);
    if ((report.status === "pending" || report.status === "cancelled") && publicIds.has(report.id)) throw new Error(`Private report exposed: ${report.id}`);
    if ((report.status === "resolved") !== (report.resolved_at !== null)) throw new Error(`Invalid resolution date: ${report.id}`);
  }
  for (const [name, bytes] of files) {
    const result = await db.storage.from("report-photos").download(`${DATASET}/${name}`);
    fail(result.error);
    if (!result.data || !Buffer.from(await result.data.arrayBuffer()).equals(bytes)) throw new Error(`Image verification failed: ${name}`);
  }
  console.log(JSON.stringify({ verified: true, reports: state.tables.reports.length, publicReports: publicRows.length, images: files.size, ...pending }, null, 2));
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { target: { type: "string" }, seed: { type: "string" }, "as-of": { type: "string" } } });
  const command = z.enum(["generate", "plan", "apply", "verify"]).parse(positionals[0]);
  if (positionals.length !== 1) throw new Error("Use one command: generate, plan, apply, or verify.");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (command === "generate") {
    const manifest = generateSeed({ seed: Number(values.seed ?? 42), asOf: values["as-of"] ?? "2026-09-27" });
    await assets(manifest);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify({ manifest: manifestPath, accounts: manifest.accounts.length, reports: manifest.reports.length, digest: digest(manifest) }, null, 2));
    return;
  }
  if (values.seed || values["as-of"]) throw new Error("Set --seed and --as-of during generate, then review the saved manifest.");
  const url = z.url().parse(process.env.SUPABASE_URL);
  const key = z.string().min(1).parse(process.env.SUPABASE_SECRET_KEY);
  checkTarget(url, values.target);
  const target = z.string().parse(values.target);
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const files = await assets(manifest);
  const fingerprint = digest({ manifest, assets: [...files].map(([name, bytes]) => [name, createHash("sha256").update(bytes).digest("hex")]) });
  const db = connect(url, key);
  const lockPath = resolve(directory, `${target}.lock`);
  const lock = command === "apply" ? await open(lockPath, "wx", 0o600) : null;
  try {
    const state = await preflight(db, manifest, fingerprint);
    console.log(JSON.stringify({ target, fingerprint, ...summary(manifest, state) }, null, 2));
    if (command === "plan") return;
    if (command === "apply") {
      const before = await snapshot(db);
      await writeFile(resolve(directory, `before-${target}.json`), JSON.stringify(Object.fromEntries(before), null, 2) + "\n", { mode: 0o600 });
      await apply(db, manifest, state, fingerprint, files, target);
      assertPreserved(before, await snapshot(db));
    }
    await verify(db, manifest, command === "apply" ? await preflight(db, manifest, fingerprint) : state, files);
  } finally {
    if (lock) { await lock.close(); await unlink(lockPath); }
  }
}

if (import.meta.main) main().catch((error: unknown) => {
  console.error(`Demo seed failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
