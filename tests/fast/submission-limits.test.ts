import { describe, expect, spyOn, test } from "bun:test";
import express from "express";
import { errorHandler } from "../../src/server/middleware/error.js";

process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";
const { citizenSubmissionLimit } = await import("../../src/server/lib/submission-limits.js");

async function requestAdmission(options: {
  contentType?: string;
  storeBody: unknown;
  storeStatus?: number;
  operation?: "report.create" | "report.photo" | "residency.proof";
  role?: "citizen" | "staff" | "admin";
  forwardedIp?: string;
}) {
  const originalFetch = globalThis.fetch;
  const rpcRequests: Array<{ action: unknown; network: unknown }> = [];
  const storeFetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/rest/v1/rpc/admit_citizen_operation")) {
      const body = JSON.parse(String(init?.body));
      rpcRequests.push({ action: body.p_action, network: body.p_network_key });
      return new Response(JSON.stringify(options.storeBody), { status: options.storeStatus ?? 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, init);
  }, { preconnect: originalFetch.preconnect });
  const store = spyOn(globalThis, "fetch").mockImplementation(storeFetch);
  const app = express();
  let uploadReached = false;
  app.use((req, _res, next) => {
    req.user = { id: "a0000000-0000-4000-8000-000000000001", name: "Citizen", email: "citizen@kamoti.invalid", role: options.role ?? "citizen", is_active: true };
    next();
  });
  app.post("/admission", citizenSubmissionLimit(options.operation ?? "report.create"), (_req, res) => {
    uploadReached = true;
    res.status(201).end();
  });
  app.use(errorHandler);
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test listener");
    const response = await originalFetch(`http://127.0.0.1:${address.port}/admission`, { method: "POST", headers: {
      "Content-Type": options.contentType ?? "application/json",
      "X-Forwarded-For": options.forwardedIp ?? "192.0.2.99",
      "X-Has-Photo": "false",
    }, body: "{}" });
    const body: unknown = response.status === 201 ? null : await response.json();
    return { status: response.status, retryAfter: response.headers.get("Retry-After"), body, rpcRequests, uploadReached };
  } finally {
    server.close();
    store.mockRestore();
  }
}

describe("citizen admission before upload parsing", () => {
  test("JSON spends report only and ignores spoofed local forwarded headers", async () => {
    const result = await requestAdmission({ storeBody: { kind: "allowed" } });
    expect(result.status).toBe(201);
    expect(result.rpcRequests).toEqual([{ action: "report.create.json", network: "127.0.0.1" }]);
    expect(result.uploadReached).toBe(true);
  });

  test("multipart always reserves the report and photo bundle despite a no-photo header", async () => {
    const result = await requestAdmission({ contentType: "multipart/form-data; boundary=test", storeBody: { kind: "allowed" } });
    expect(result.status).toBe(201);
    expect(result.rpcRequests[0]?.action).toBe("report.create.multipart");
  });

  test("trusted proxy IPv4-mapped addresses normalize to the same IPv4 key", async () => {
    const previousVercel = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      for (const forwardedIp of ["192.0.2.99", "::ffff:192.0.2.99", "0:0:0:0:0:ffff:c000:263"]) {
        const originalFetch = globalThis.fetch;
        const app = express();
        app.set("trust proxy", 1);
        app.use((req, _res, next) => {
          req.user = { id: "a0000000-0000-4000-8000-000000000001", name: "Citizen", email: "citizen@kamoti.invalid", role: "citizen", is_active: true };
          next();
        });
        let network: unknown;
        const store = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
          if (String(input).includes("/rest/v1/rpc/admit_citizen_operation")) {
            network = JSON.parse(String(init?.body)).p_network_key;
            return Response.json({ kind: "allowed" });
          }
          return originalFetch(input, init);
        }, { preconnect: originalFetch.preconnect }));
        app.post("/admission", citizenSubmissionLimit("report.create"), (_req, res) => res.status(201).end());
        app.use(errorHandler);
        const server = app.listen(0);
        try {
          const address = server.address();
          if (!address || typeof address === "string") throw new Error("Missing test listener");
          const response = await originalFetch(`http://127.0.0.1:${address.port}/admission`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": forwardedIp }, body: "{}" });
          expect(response.status).toBe(201);
          expect(network).toBe("192.0.2.99");
        } finally {
          server.close();
          store.mockRestore();
        }
      }
    } finally {
      if (previousVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previousVercel;
    }
  });

  test("a parsed quota refusal stops before uploads and carries retry headers and details", async () => {
    const result = await requestAdmission({ storeBody: { kind: "limited", operation: "photo", retry_after_seconds: 90, retry_at: "2026-10-05T12:00:00Z" } });
    expect(result.status).toBe(429);
    expect(result.retryAfter).toBe("90");
    expect(result.body).toEqual({ error: "Too many report photos were attempted recently. Try again in 2 minutes.", details: {
      code: "citizen_submission_limited", operation: "photo", retry_after_seconds: 90, retry_at: "2026-10-05T12:00:00Z",
    } });
    expect(result.uploadReached).toBe(false);
  });

  test.each([
    { kind: "limited", operation: "photo", retry_after_seconds: 0, retry_at: "2026-10-05T12:00:00Z" },
    { kind: "allowed", leaked: "database internals" },
    null,
  ])("malformed RPC response fails closed before uploads", async (storeBody) => {
    const result = await requestAdmission({ storeBody });
    expect(result.status).toBe(503);
    expect(result.retryAfter).toBe("60");
    expect(result.uploadReached).toBe(false);
    expect(result.body).toMatchObject({ details: { code: "citizen_submission_unavailable", retry_after_seconds: 60 } });
  });

  test("a store outage is not retried or exposed", async () => {
    const result = await requestAdmission({ storeStatus: 503, storeBody: { code: "XX000", message: "internal credential connection failure" } });
    expect(result.status).toBe(503);
    expect(result.rpcRequests.length).toBe(1);
    expect(result.uploadReached).toBe(false);
    expect(JSON.stringify(result.body)).not.toContain("credential");
  });

  test("staff photo admission bypasses citizen quota storage", async () => {
    const result = await requestAdmission({ operation: "report.photo", role: "staff", storeBody: null });
    expect(result.status).toBe(201);
    expect(result.rpcRequests).toEqual([]);
  });

  test("unsupported report transport reaches neither the store nor the upload", async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: "a0000000-0000-4000-8000-000000000001", name: "Citizen", email: "citizen@kamoti.invalid", role: "citizen", is_active: true };
      next();
    });
    app.post("/report", citizenSubmissionLimit("report.create"), (_req, res) => res.status(201).end());
    app.use(errorHandler);
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing test listener");
      const response = await fetch(`http://127.0.0.1:${address.port}/report`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "upload" });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Send this report as JSON or multipart form data." });
    } finally {
      server.close();
    }
  });
});
