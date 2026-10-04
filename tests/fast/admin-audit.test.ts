import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { once } from "node:events";
import type { Server } from "node:http";
import { app } from "../../src/server/app.js";
import { db } from "../../src/server/config/supabase.js";

// Real HTTP routes with isolated Supabase adapters. Database rollback is tested
// separately by tests/database/atomic-actions.sql against PostgreSQL.
const ADMIN = "c0000000-0000-4000-8000-000000000001";
const CITIZEN = "c0000000-0000-4000-8000-000000000002";
const PROOF_URL = "https://proof.test.invalid/private-signed-link";
const original = { from: db.from, rpc: db.rpc, getUser: db.auth.getUser, storage: db.storage.from, fetch: globalThis.fetch };
let server: Server;
let base: string;
let auditFails: boolean;
let rpcFails: boolean;
let externalRequests: number;
let rpcCalls: { name: string; args: Record<string, unknown> }[];

function profile(id: string) {
  return {
    id, name: "Synthetic Test Person", email: "synthetic@kamoti.invalid", role: id === ADMIN ? "admin" : "citizen",
    is_active: true, first_name: "Synthetic", middle_name: null, last_name: "Person", suffix: null,
    contact_number: null, phone_verified_at: null, barangay: null, address_line: null,
    residency_status: "pending", residency_note: null, residency_proof_path: "synthetic/proof.pdf",
    created_at: "2026-10-04T00:00:00Z", residency_reviewed_at: null, reviewer: null, has_residency_proof: true,
  };
}

beforeAll(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test HTTP server did not start");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  const closed = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  server.closeAllConnections();
  await closed;
});
beforeEach(() => {
  auditFails = false; rpcFails = false; externalRequests = 0; rpcCalls = [];
  globalThis.fetch = Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== "127.0.0.1") {
      externalRequests++;
      throw new Error("HTTP audit tests refuse external requests");
    }
    return original.fetch(input, init);
  }, { preconnect: original.fetch.preconnect });
  (db.auth as unknown as { getUser: unknown }).getUser = async (token: string) => ({
    data: { user: { id: token === "synthetic-admin" ? ADMIN : CITIZEN } }, error: null,
  });
  (db.storage as unknown as { from: unknown }).from = () => ({
    createSignedUrl: async () => ({ data: { signedUrl: PROOF_URL }, error: null }),
  });
  (db as unknown as { from: unknown }).from = (table: string) => {
    let id = CITIZEN;
    const builder = {
      select() { return builder; }, eq(_field: string, value: string) { id = value; return builder; },
      single() { return builder; }, maybeSingle() { return builder; }, insert() { return builder; },
      then(resolve: (answer: unknown) => unknown) {
        return Promise.resolve(table === "profiles" ? { data: profile(id), error: null } :
          { data: null, error: auditFails ? { message: "Injected audit failure" } : null }).then(resolve);
      },
    };
    return builder;
  };
  (db as unknown as { rpc: unknown }).rpc = async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    return rpcFails ? { data: null, error: { code: "XX000", message: "Injected transactional audit failure" } } :
      { data: { ...profile(CITIZEN), role: "admin" }, error: null };
  };
});
afterEach(() => {
  db.from = original.from; db.rpc = original.rpc; db.auth.getUser = original.getUser; db.storage.from = original.storage;
  globalThis.fetch = original.fetch;
  expect(externalRequests).toBe(0);
});

test("private proof access returns its five-minute URL when its audit write succeeds", async () => {
  const response = await fetch(`${base}/api/admin/users/${CITIZEN}/residency-proof`, { headers: { Authorization: "Bearer synthetic-admin" } });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ url: PROOF_URL, expires_in: 300 });
});
test("private proof access withholds the signed URL when its audit write fails", async () => {
  auditFails = true;
  const response = await fetch(`${base}/api/admin/users/${CITIZEN}/residency-proof`, { headers: { Authorization: "Bearer synthetic-admin" } });
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain(PROOF_URL);
});
test("a citizen cannot obtain a private proof URL", async () => {
  const response = await fetch(`${base}/api/admin/users/${CITIZEN}/residency-proof`, { headers: { Authorization: "Bearer synthetic-citizen" } });
  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain(PROOF_URL);
});
test("role changes pass the authenticated actor to the transaction and strip private object keys", async () => {
  const response = await fetch(`${base}/api/admin/users/${CITIZEN}`, {
    method: "PATCH", headers: { Authorization: "Bearer synthetic-admin", "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin", actor_id: CITIZEN }),
  });
  expect(response.status).toBe(200);
  expect(rpcCalls).toEqual([{ name: "admin_change_profile", args: {
    p_actor_id: ADMIN, p_user_id: CITIZEN, p_action: "user.updated", p_input: { role: "admin" }, p_ip: "127.0.0.1",
  } }]);
  expect(await response.text()).not.toContain("residency_proof_path");
});
test("a failed required audit in the role transaction produces a failed HTTP response", async () => {
  rpcFails = true;
  const response = await fetch(`${base}/api/admin/users/${CITIZEN}`, {
    method: "PATCH", headers: { Authorization: "Bearer synthetic-admin", "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin" }),
  });
  expect(response.status).toBe(500);
  expect(rpcCalls).toHaveLength(1);
});
