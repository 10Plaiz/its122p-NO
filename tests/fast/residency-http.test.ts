import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { once } from "node:events";
import type { Server } from "node:http";

process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";
const { app } = await import("../../src/server/app.js");
const { db } = await import("../../src/server/config/supabase.js");

const ADMIN = "d0000000-0000-4000-8000-000000000001";
const CITIZEN = "d0000000-0000-4000-8000-000000000002";
const VERSION = "d0000000-0000-4000-8000-000000000010";
const NEW_VERSION = "d0000000-0000-4000-8000-000000000011";
const SUBMISSION = "d0000000-0000-4000-8000-000000000020";
const OTHER_SUBMISSION = "d0000000-0000-4000-8000-000000000021";
const OLD_PROOF = "d0000000-0000-4000-8000-000000000022";
const PDF = Buffer.from("%PDF-1.7 synthetic proof");
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
const original = { from: db.from, rpc: db.rpc, getUser: db.auth.getUser, storage: db.storage.from, fetch: globalThis.fetch };
let server: Server;
let base: string;
let requestNumber = 0;
let externalRequests = 0;
let profile: Omit<ReturnType<typeof account>, "phone_verified_at"> & { phone_verified_at: string | null };
let records: Map<string, { id: string; user_id: string; object_path: string; sha256: string }>;
let objects: Map<string, Buffer>;
let uploads: { path: string; upsert: boolean }[];
let deletes: string[];
let auditRows: Record<string, unknown>[];
let rpcCalls: { name: string; args: Record<string, unknown> }[];
let admissionCalls: Record<string, unknown>[];
let admissionLimited: boolean;
let storageFails: boolean;
let auditFails: boolean;
let rpcFault: "none" | "failure" | "ambiguous" | "conflict";

function account() {
  return {
    id: CITIZEN, name: "Ana Reyes", email: "ana@kamoti.invalid", role: "citizen",
    is_active: true, first_name: "Ana", middle_name: null, last_name: "Reyes", suffix: null,
    contact_number: "09171234567", phone_verified_at: "2026-10-04T00:00:00Z", barangay: "Poblacion",
    address_line: "12 Sample Street", residency_status: "pending", residency_note: null,
    residency_review_version: VERSION, residency_proof_id: OLD_PROOF,
    residency_proof_path: `${CITIZEN}/${OLD_PROOF}.pdf`, created_at: "2026-10-04T00:00:00Z",
    residency_reviewed_at: null, reviewer: null, has_residency_proof: true,
  };
}

beforeAll(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP server did not start.");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  server.closeAllConnections();
  await closed;
});
beforeEach(() => {
  profile = account(); records = new Map(); objects = new Map([[profile.residency_proof_path, PDF]]);
  uploads = []; deletes = []; auditRows = []; rpcCalls = []; admissionCalls = []; admissionLimited = false;
  storageFails = false; auditFails = false; rpcFault = "none"; externalRequests = 0;
  globalThis.fetch = Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== "127.0.0.1") {
      externalRequests++;
      throw new Error("Residency HTTP tests refuse external requests.");
    }
    return original.fetch(input, init);
  }, { preconnect: original.fetch.preconnect });
  Object.assign(db.auth, { getUser: async (token: string) => ({
    data: { user: { id: token === "admin" ? ADMIN : CITIZEN } }, error: null,
  }) });
  Object.assign(db, { from(table: string) {
    let id = CITIZEN;
    const builder = {
      select() { return builder; }, eq(_field: string, value: string) { id = value; return builder; },
      single() { return builder; }, maybeSingle() { return builder; },
      insert(row: Record<string, unknown>) { auditRows.push(row); return builder; },
      then(resolve: (answer: unknown) => unknown) {
        if (table === "profiles") return Promise.resolve({ data: id === ADMIN ? { ...profile, id: ADMIN, role: "admin" } : profile, error: null }).then(resolve);
        if (table === "residency_proof_versions") return Promise.resolve({ data: records.get(id) ?? null, error: null }).then(resolve);
        if (table === "activity_logs") return Promise.resolve({ data: null, error: auditFails ? { message: "Injected audit failure" } : null }).then(resolve);
        throw new Error(`Unexpected table ${table}`);
      },
    };
    return builder;
  }, rpc: (name: string, args: Record<string, unknown>) => {
    if (name === "admit_citizen_operation") {
      admissionCalls.push(args);
      const receipt = records.get(String(args.p_submission_id));
      const denied = profile.residency_status === "verified" && (!receipt || receipt.user_id !== CITIZEN);
      const builder = {
        retry() { return builder; },
        abortSignal() {
          return Promise.resolve(denied
            ? { data: null, error: { code: "PT400", message: "Already verified" } }
            : { data: admissionLimited ? { kind: "limited", operation: "proof", retry_after_seconds: 60,
              retry_at: new Date(Date.now() + 60_000).toISOString() } : { kind: "allowed" }, error: null });
        },
      };
      return builder;
    }
    return (async () => {
      rpcCalls.push({ name, args });
      if (rpcFault === "conflict") return { data: null, error: { code: "PT409", message: "Refresh the residency review before continuing." } };
      if (rpcFault === "failure") return { data: null, error: { code: "XX000", message: "Injected profile failure" } };
      if (name === "complete_residency_proof") {
        const id = String(args.p_submission_id);
        if (!records.has(id)) {
          records.set(id, { id, user_id: CITIZEN, object_path: String(args.p_object_path), sha256: String(args.p_sha256) });
          profile = { ...profile, residency_proof_id: id, residency_proof_path: String(args.p_object_path), residency_review_version: NEW_VERSION };
        }
      }
      if (name === "update_own_profile") {
        const input = args.p_input;
        if (!input || typeof input !== "object" || !("contact_number" in input)) throw new Error("Invalid self update input.");
        profile = { ...profile, phone_verified_at: input.contact_number === profile.contact_number ? profile.phone_verified_at : null };
      }
      if (rpcFault === "ambiguous") return { data: null, error: { code: "XX000", message: "Acknowledgement lost after commit" } };
      return { data: profile, error: null };
    })();
  } });
  Object.assign(db.storage, { from: () => ({
    upload: async (path: string, bytes: Buffer, options: { upsert: boolean }) => {
      uploads.push({ path, upsert: options.upsert });
      if (storageFails || objects.has(path)) return { data: null, error: { message: "Injected Storage failure" } };
      objects.set(path, Buffer.from(bytes));
      return { data: { path }, error: null };
    },
    download: async (path: string) => ({ data: objects.has(path) ? new Blob([new Uint8Array(objects.get(path)!)]) : null, error: objects.has(path) ? null : { message: "Not found" } }),
    remove: async (paths: string[]) => { deletes.push(...paths); return { data: null, error: null }; },
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://proof.test.invalid/${path}` }, error: null }),
  }) });
});
afterEach(() => {
  db.from = original.from; db.rpc = original.rpc; db.auth.getUser = original.getUser; db.storage.from = original.storage;
  globalThis.fetch = original.fetch;
  expect(externalRequests).toBe(0);
  expect(deletes).toEqual([]);
});

function request(path: string, init: RequestInit = {}, token = "admin") {
  requestNumber++;
  return fetch(`${base}/api/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`,
    "X-Forwarded-For": `198.18.${Math.floor(requestNumber / 250)}.${requestNumber % 250 + 1}`, ...init.headers } });
}
function upload({ submission = SUBMISSION, version = VERSION, bytes = PDF, type = "application/pdf", querySubmission = submission }: {
  submission?: string; version?: string; bytes?: Buffer; type?: string; querySubmission?: string;
} = {}) {
  const form = new FormData();
  form.set("submission_id", submission); form.set("expected_version", version);
  form.set("proof", new Blob([new Uint8Array(bytes)], { type }), "proof");
  return request(`auth/me/residency-proof?submission_id=${querySubmission}`, { method: "POST", body: form }, "citizen");
}
function json(body: unknown) { return { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }; }

test("one current admin profile includes both review identities and hides the private object path", async () => {
  const response = await request(`admin/users/${CITIZEN}`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.user).toMatchObject({ residency_review_version: VERSION, residency_proof_id: OLD_PROOF });
  expect(body.user).not.toHaveProperty("residency_proof_path");
});
test("the current citizen profile includes both review identities and hides its private proof path", async () => {
  const response = await request("auth/me", {}, "citizen");
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.user).toMatchObject({ residency_review_version: VERSION, residency_proof_id: OLD_PROOF });
  expect(body.user).not.toHaveProperty("residency_proof_path");
});
test("UUID letter case uses the same snapshot and canonical immutable object path", async () => {
  const response = await request(`admin/users/${CITIZEN.toUpperCase()}/residency-proof?expected_version=${VERSION.toUpperCase()}`);
  expect(response.status).toBe(200);
  expect((await response.json()).residency_review_version).toBe(VERSION);
  expect((await upload({ submission: SUBMISSION.toUpperCase(), version: VERSION.toUpperCase() })).status).toBe(200);
  expect(uploads).toEqual([{ path: `${CITIZEN}/${SUBMISSION}.pdf`, upsert: false }]);
});
test("stale proof access returns 409 without a signed URL or an audit", async () => {
  const response = await request(`admin/users/${CITIZEN}/residency-proof?expected_version=${NEW_VERSION}`);
  expect(response.status).toBe(409); expect(await response.text()).not.toContain("proof.test.invalid");
  expect(auditRows).toEqual([]);
});
test("proof access returns the exact document and saves its identities in the required audit", async () => {
  const response = await request(`admin/users/${CITIZEN}/residency-proof?expected_version=${VERSION}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ url: `https://proof.test.invalid/${CITIZEN}/${OLD_PROOF}.pdf`,
    kind: "pdf", expires_in: 300, residency_proof_id: OLD_PROOF, residency_review_version: VERSION });
  expect(auditRows[0]).toMatchObject({ action: "residency.proof_viewed", metadata: {
    residency_proof_id: OLD_PROOF, residency_review_version: VERSION,
  } });
});
test("failed proof audit withholds the exact signed document", async () => {
  auditFails = true;
  const response = await request(`admin/users/${CITIZEN}/residency-proof?expected_version=${VERSION}`);
  expect(response.status).toBe(500); expect(await response.text()).not.toContain("proof.test.invalid");
});
test("the decision forwards the snapshot version and converts the atomic conflict to 409", async () => {
  rpcFault = "conflict";
  const response = await request(`admin/users/${CITIZEN}/residency`, json({ decision: "verified", expected_version: VERSION }));
  expect(response.status).toBe(409); expect(await response.text()).toContain("Refresh");
  expect(rpcCalls).toEqual([{ name: "admin_change_profile", args: { p_actor_id: ADMIN, p_user_id: CITIZEN,
    p_action: "residency.reviewed", p_input: { decision: "verified", note: null, expected_version: VERSION },
    p_ip: expect.any(String) } }]);
});
test("UUID validation rejects missing versions and malformed IDs before a decision", async () => {
  for (const [id, body] of [[CITIZEN, { decision: "verified" }], ["invalid", { decision: "verified", expected_version: VERSION }],
    [CITIZEN, { decision: "verified", expected_version: "invalid" }]] as const) {
    const response = await request(`admin/users/${id}/residency`, json(body));
    expect(response.status).toBe(400);
  }
  expect(rpcCalls).toEqual([]);
  const response = await request(`admin/users/${CITIZEN}/residency-proof`);
  expect(response.status).toBe(400);
});
test("multipart upload needs both UUID fields", async () => {
  for (const [submission, version] of [["", VERSION], [SUBMISSION, ""], ["invalid", VERSION]]) {
    const response = await upload({ submission, version });
    expect(response.status).toBe(400);
  }
  expect(uploads).toEqual([]); expect(rpcCalls).toEqual([]);
});

test("proof admission receives the normalized receipt before upload", async () => {
  expect((await upload({ submission: SUBMISSION.toUpperCase() })).status).toBe(200);
  expect(admissionCalls).toEqual([{ p_actor_id: CITIZEN, p_network_key: "127.0.0.1",
    p_action: "residency.proof", p_submission_id: SUBMISSION }]);
});

test("a mismatched URL and form receipt cannot attach a proof", async () => {
  expect((await upload({ querySubmission: OTHER_SUBMISSION })).status).toBe(400);
  expect(uploads).toEqual([]); expect(rpcCalls).toEqual([]);
});

test("a confirmed receipt retry still respects admission limits before multipart validation", async () => {
  expect((await upload()).status).toBe(200);
  profile = { ...profile, residency_status: "verified" };
  admissionLimited = true;
  const response = await request(`auth/me/residency-proof?submission_id=${SUBMISSION}`,
    { method: "POST", headers: { "Content-Type": "text/plain" }, body: "invalid multipart" }, "citizen");
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(uploads).toHaveLength(1); expect(rpcCalls).toHaveLength(1);
  expect(profile.residency_status).toBe("verified");
});

test("an unknown verified receipt is refused before Storage or attachment", async () => {
  profile = { ...profile, residency_status: "verified" };
  expect((await upload()).status).toBe(400);
  expect(uploads).toEqual([]); expect(rpcCalls).toEqual([]); expect(auditRows).toEqual([]);
});
test("same format replacements keep each old proof byte and use unique paths", async () => {
  expect((await upload()).status).toBe(200);
  expect((await upload({ submission: OTHER_SUBMISSION, version: NEW_VERSION })).status).toBe(200);
  expect(uploads).toEqual([{ path: `${CITIZEN}/${SUBMISSION}.pdf`, upsert: false }, { path: `${CITIZEN}/${OTHER_SUBMISSION}.pdf`, upsert: false }]);
  expect(objects.get(`${CITIZEN}/${OLD_PROOF}.pdf`)).toEqual(PDF);
  expect(objects.get(`${CITIZEN}/${SUBMISSION}.pdf`)).toEqual(PDF);
  expect(rpcCalls[0]?.args).toMatchObject({ p_expected_version: VERSION, p_sha256: "96f2871c402a550ed8a05b5ae8d81d6e35293d8b1d94d929733795442ff129c9" });
  expect(auditRows).toEqual([]);
});
test("different format replacements preserve the previous signed document bytes", async () => {
  expect((await upload({ bytes: JPG, type: "image/jpeg" })).status).toBe(200);
  expect(uploads).toEqual([{ path: `${CITIZEN}/${SUBMISSION}.jpg`, upsert: false }]);
  expect(objects.get(`${CITIZEN}/${OLD_PROOF}.pdf`)).toEqual(PDF);
  expect(objects.get(`${CITIZEN}/${SUBMISSION}.jpg`)).toEqual(JPG);
});
test("Storage failure returns an error without changing the current proof", async () => {
  storageFails = true;
  const response = await upload();
  expect(response.status).toBe(500); expect(rpcCalls).toEqual([]);
  expect(profile.residency_proof_id).toBe(OLD_PROOF);
  expect(objects.get(profile.residency_proof_path)).toEqual(PDF);
});
test("profile failure retains the uploaded object and exact orphan retry compares bytes", async () => {
  rpcFault = "failure";
  expect((await upload()).status).toBe(500);
  expect(profile.residency_proof_id).toBe(OLD_PROOF);
  expect(objects.get(`${CITIZEN}/${SUBMISSION}.pdf`)).toEqual(PDF);
  rpcFault = "none";
  const response = await upload();
  expect(response.status).toBe(200); expect((await response.json()).user.residency_proof_id).toBe(SUBMISSION);
  expect(objects.get(`${CITIZEN}/${OLD_PROOF}.pdf`)).toEqual(PDF);
});
test("different bytes under an orphan submission ID return 409 without attachment", async () => {
  objects.set(`${CITIZEN}/${SUBMISSION}.pdf`, Buffer.from("%PDF-1.7 different"));
  expect((await upload()).status).toBe(409); expect(rpcCalls).toEqual([]);
  expect(profile.residency_proof_id).toBe(OLD_PROOF);
});
test("lost commit acknowledgement retains current proof and confirmed retry preserves a later decision", async () => {
  rpcFault = "ambiguous";
  expect((await upload()).status).toBe(500);
  expect(profile.residency_proof_id).toBe(SUBMISSION);
  expect(objects.get(profile.residency_proof_path)).toEqual(PDF);
  profile = { ...profile, residency_status: "verified" };
  rpcFault = "none";
  const response = await upload();
  expect(response.status).toBe(200);
  expect((await response.json()).user).toMatchObject({ residency_status: "verified", residency_proof_id: SUBMISSION });
  expect(uploads).toHaveLength(1);
});
test("committed submission ID cannot be reused with another format", async () => {
  expect((await upload()).status).toBe(200);
  const response = await upload({ bytes: JPG, type: "image/jpeg" });
  expect(response.status).toBe(409); expect(uploads).toHaveLength(1);
  expect(profile.residency_proof_path).toBe(`${CITIZEN}/${SUBMISSION}.pdf`);
});
test("committed submission ID cannot be reused with different bytes in the same format", async () => {
  expect((await upload()).status).toBe(200);
  const response = await upload({ bytes: Buffer.from("%PDF-1.7 different document") });
  expect(response.status).toBe(409);
  expect(uploads).toHaveLength(1);
  expect(objects.get(profile.residency_proof_path)).toEqual(PDF);
});
test("a proof attachment conflict leaves the previous proof usable and reports no success", async () => {
  rpcFault = "conflict";
  const response = await upload();
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.error).toContain("Refresh"); expect(body).not.toHaveProperty("user");
  expect(profile.residency_proof_id).toBe(OLD_PROOF);
  expect(objects.get(profile.residency_proof_path)).toEqual(PDF);
  expect(objects.get(`${CITIZEN}/${SUBMISSION}.pdf`)).toEqual(PDF);
});
test("self edits retain an unchanged verified phone and strip private RPC columns", async () => {
  const response = await request("auth/me", json({ first_name: "Ana", last_name: "Reyes",
    contact_number: "09171234567", barangay: "Poblacion", address_line: "12 Sample Street" }), "citizen");
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.user.phone_verified_at).toBe("2026-10-04T00:00:00Z");
  expect(body.user).not.toHaveProperty("residency_proof_path");
  expect(body.user).not.toHaveProperty("reviewer");
});
test("self edits clear verification when the phone is removed", async () => {
  const response = await request("auth/me", json({ first_name: "Ana", last_name: "Reyes",
    barangay: "Poblacion", address_line: "12 Sample Street" }), "citizen");
  expect(response.status).toBe(200);
  expect((await response.json()).user.phone_verified_at).toBeNull();
  expect(rpcCalls[0]?.args.p_input).toMatchObject({ contact_number: null, name: "Ana Reyes" });
});
test("a failed self update returns an error without a success profile", async () => {
  rpcFault = "failure";
  const response = await request("auth/me", json({ first_name: "Ana", last_name: "Reyes",
    barangay: "Poblacion", address_line: "12 Sample Street" }), "citizen");
  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body.error).toBe("Your details could not be saved. Try again.");
  expect(body).not.toHaveProperty("user");
});
test("self edits send name and phone fields to the locked operation without pre-read review changes", async () => {
  profile = { ...profile, residency_status: "rejected" };
  const response = await request("auth/me", json({ first_name: "Ana", middle_name: "Santos", last_name: "Reyes",
    suffix: "Jr.", contact_number: "09181234567", barangay: "Bel-Air", address_line: "34 Other Street" }), "citizen");
  expect(response.status).toBe(200);
  expect((await response.json()).user).toMatchObject({ residency_status: "rejected", phone_verified_at: null });
  expect(rpcCalls).toEqual([{ name: "update_own_profile", args: { p_user_id: CITIZEN, p_input: {
    first_name: "Ana", middle_name: "Santos", last_name: "Reyes", suffix: "Jr.", name: "Ana Santos Reyes Jr.",
    contact_number: "09181234567", barangay: "Bel-Air", address_line: "34 Other Street",
  }, p_ip: expect.any(String) } }]);
});
