import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { once } from "node:events";
import type { Server } from "node:http";

// Issue #59: new reports and report photos wait for an administrator's approval of
// the citizen's proof of residency. Real routes, stubbed Supabase: every request
// re-reads `profile`, so changing it between requests is a status change made
// while the citizen's session stays open.

process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";
const { app } = await import("../../src/server/app.js");
const { db } = await import("../../src/server/config/supabase.js");

const CITIZEN = "e0000000-0000-4000-8000-000000000002";
const REPORT = "e0000000-0000-4000-8000-000000000030";
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const original = { from: db.from, rpc: db.rpc, getUser: db.auth.getUser, storage: db.storage.from };

type Profile = { residency_status: string | null; residency_proof_path: string | null; is_active: boolean };
let profile: Profile;
let admissions: number;
let rejectedBeforeAdmission: boolean;
let writes: string[];
let uploads: string[];
let server: Server;
let base: string;
let requestNumber = 0;

beforeAll(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP server did not start.");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  const closed = new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  server.closeAllConnections();
  await closed;
});

beforeEach(() => {
  profile = { residency_status: "pending", residency_proof_path: `${CITIZEN}/proof.pdf`, is_active: true };
  admissions = 0;
  rejectedBeforeAdmission = false;
  writes = [];
  uploads = [];
  Object.assign(db.auth, { getUser: async () => ({ data: { user: { id: CITIZEN } }, error: null }) });
  Object.assign(db, {
    from(table: string) {
      let one = false;
      const answer = () => {
        if (table === "profiles") {
          return { data: { id: CITIZEN, name: "Ana", email: "ana@kamoti.invalid", role: "citizen", ...profile }, error: null };
        }
        if (table === "reports" && one) return { data: { id: REPORT, status: "pending", citizen: { id: CITIZEN } }, error: null };
        return { data: [], error: null, count: 0 };
      };
      const builder: object = new Proxy({}, {
        get(_target, key) {
          if (key === "then") return (resolve: (value: unknown) => unknown) => Promise.resolve(answer()).then(resolve);
          return (..._args: unknown[]) => {
            if (key === "single" || key === "maybeSingle") one = true;
            if (key === "insert" || key === "update" || key === "upsert") writes.push(table);
            return builder;
          };
        },
      });
      return builder;
    },
    rpc(name: string) {
      if (name !== "admit_citizen_operation") throw new Error(`Unexpected RPC ${name}`);
      admissions++;
      const builder = {
        retry: () => builder,
        // The database re-reads the profile under a row lock. A rejection that
        // committed after requireAuth read it is seen here (PT403).
        abortSignal: async () => (rejectedBeforeAdmission
          ? { data: null, error: { code: "PT403", message: "Upload your proof of residency to continue." } }
          : { data: { kind: "allowed" }, error: null }),
      };
      return builder;
    },
  });
  Object.assign(db.storage, {
    from: () => ({
      upload: async (path: string) => {
        uploads.push(path);
        return { data: { path }, error: null };
      },
    }),
  });
});
afterEach(() => {
  db.from = original.from;
  db.rpc = original.rpc;
  db.auth.getUser = original.getUser;
  db.storage.from = original.storage;
});

function send(path: string, init: RequestInit = {}) {
  requestNumber++;
  return fetch(`${base}/api/${path}`, {
    ...init,
    headers: { Authorization: "Bearer citizen", "X-Forwarded-For": `198.19.0.${(requestNumber % 250) + 1}`, ...init.headers },
  });
}
const fileReport = () => send("reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
function addPhoto() {
  const form = new FormData();
  form.set("photo", new Blob([new Uint8Array(JPG)], { type: "image/jpeg" }), "photo.jpg");
  return send(`reports/${REPORT}/photos`, { method: "POST", body: form });
}
async function code(response: Response) {
  return ((await response.json()) as { details?: { code?: string } }).details?.code;
}
function expectNothingWritten() {
  expect(admissions).toBe(0);
  expect(writes).toEqual([]);
  expect(uploads).toEqual([]);
}

test("a pending citizen cannot file a report or add a photo by a direct request", async () => {
  const report = await fileReport();
  expect(report.status).toBe(403);
  expect(await code(report)).toBe("residency_pending");
  const photo = await addPhoto();
  expect(photo.status).toBe(403);
  expect(await code(photo)).toBe("residency_pending");
  expectNothingWritten();
});

test("a citizen with no proof, or a rejected one, stays locked out", async () => {
  for (const facts of [
    { residency_status: "pending", residency_proof_path: null },
    { residency_status: "rejected", residency_proof_path: `${CITIZEN}/proof.pdf` },
  ]) {
    profile = { ...profile, ...facts };
    for (const response of [await fileReport(), await addPhoto()]) {
      expect(response.status).toBe(403);
      expect(await code(response)).toBe("residency_required");
    }
  }
  expectNothingWritten();
});

test("approval opens both actions in a session opened before it", async () => {
  expect((await fileReport()).status).toBe(403);
  profile = { ...profile, residency_status: "verified" };
  // Past the gate: the quota is checked, then the empty body or missing file is refused.
  expect((await fileReport()).status).toBe(400);
  const photo = await send(`reports/${REPORT}/photos`, { method: "POST", body: new FormData() });
  expect(photo.status).toBe(400);
  expect(admissions).toBe(2);
});

test("a re-upload or an address change that returns a verified citizen to pending closes both actions", async () => {
  profile = { ...profile, residency_status: "verified" };
  expect((await fileReport()).status).toBe(400);
  // update_own_profile and complete_residency_proof both leave the status pending.
  profile = { ...profile, residency_status: "pending" };
  admissions = 0;
  expect(await code(await fileReport())).toBe("residency_pending");
  expect(await code(await addPhoto())).toBe("residency_pending");
  expectNothingWritten();
});

test("a rejection that lands while a submission is in progress refuses it before anything is saved", async () => {
  // requireAuth reads "verified"; the rejection commits before the admission check.
  profile = { ...profile, residency_status: "verified" };
  rejectedBeforeAdmission = true;
  const report = await fileReport();
  expect(report.status).toBe(403);
  const photo = await addPhoto();
  expect(photo.status).toBe(403);
  expect(admissions).toBe(2);
  expect(writes).toEqual([]);
  expect(uploads).toEqual([]);
});

test("an inactive account stays blocked even when approved", async () => {
  profile = { ...profile, residency_status: "verified", is_active: false };
  const response = await fileReport();
  expect(response.status).toBe(403);
  expect(((await response.json()) as { error: string }).error).toContain("deactivated");
  expectNothingWritten();
});

test("a pending citizen keeps their report history and notifications", async () => {
  expect((await send("reports")).status).toBe(200);
  expect((await send("notifications")).status).toBe(200);
});
