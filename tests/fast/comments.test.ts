process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import type { AuthUser } from "../../src/server/types/auth.js";

// RS-6: the reporting citizen comments on their own report at any status. The
// real route runs in a small app; the signed-in user comes from test headers and
// the database is a recording stand-in.

const { db } = await import("../../src/server/config/supabase.js");
const { default: workflowRouter } = await import("../../src/server/routes/reports.workflow.routes.js");
const { errorHandler } = await import("../../src/server/middleware/error.js");
const { limits } = await import("../../src/server/lib/rate-limit.js");
const { closurePendingOf, historyLabel } = await import("../../src/web/lib/types.js");

const STAFF = "11111111-1111-4111-8111-111111111111";
const ADMIN_A = "33333333-3333-4333-8333-333333333333";
const ADMIN_B = "55555555-5555-4555-8555-555555555555";

type Write = { table: string; op: string; payload?: unknown };
let writes: Write[] = [];
let reportRow: Record<string, unknown> = {};

// Every query answers from the table it names; writes are recorded.
function fakeFrom(table: string) {
  const write: Write = { table, op: "select" };
  writes.push(write);
  const answer = () => {
    if (table === "reports") return { data: reportRow, error: null };
    if (table === "profiles") return { data: [{ id: ADMIN_A }, { id: ADMIN_B }], error: null };
    return { data: null, error: null };
  };
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "eq", "is", "not", "in", "order", "limit"]) builder[name] = () => builder;
  for (const op of ["insert", "update"]) {
    builder[op] = (payload: unknown) => {
      write.op = op;
      write.payload = payload;
      return builder;
    };
  }
  builder.single = async () => answer();
  builder.maybeSingle = async () => answer();
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(answer()).then(resolve, reject);
  return builder;
}

const originalFrom = db.from.bind(db);
let server: Server;
let base = "";

beforeAll(async () => {
  (db as unknown as { from: unknown }).from = fakeFrom;
  const app = express();
  app.use(express.json());
  // Stands in for requireAuth: the test names who is signed in.
  app.use((req, _res, next) => {
    const role = req.header("x-test-role") as AuthUser["role"] | undefined;
    const id = req.header("x-test-user");
    if (role && id) req.user = { id, role, name: `${role} user`, email: `${role}@example.com`, is_active: true };
    next();
  });
  app.use("/api/reports", workflowRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(() => {
  server.close();
  (db as unknown as { from: unknown }).from = originalFrom;
});

afterEach(() => {
  writes = [];
});

// Each report gets its own owner, so one test's comments never count toward the
// next test's hourly limit (the limiter is shared, like in the app).
function owned(overrides: Record<string, unknown> = {}) {
  return {
    id: "report-c-1",
    reference_code: "KMT-2026-000300",
    title: "Clogged drain",
    status: "resolved",
    is_public: true,
    citizen: { id: crypto.randomUUID() },
    assigned_staff: { id: STAFF },
    photos: [],
    ...overrides,
  };
}

const ownerOf = () => (reportRow.citizen as { id: string }).id;

function comment(user: string, role: AuthUser["role"], details = "The drain is flooding again after the rain.") {
  return fetch(`${base}/api/reports/report-c-1/remarks`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": user, "x-test-role": role },
    body: JSON.stringify({ details }),
  });
}

const notices = () =>
  (writes.find((write) => write.table === "notifications")?.payload as { user_id: string; message: string }[] | undefined) ?? [];

describe("RS-6 citizens comment on their own reports", () => {
  for (const status of ["pending", "under_review", "in_progress", "resolved", "rejected", "cancelled"]) {
    it(`accepts the owner's comment on a ${status} report`, async () => {
      reportRow = owned({ status });
      const res = await comment(ownerOf(), "citizen");
      expect(res.status).toBe(201);
      const history = writes.find((write) => write.table === "report_updates");
      expect(history?.payload).toMatchObject({ update_type: "remark", updated_by: ownerOf() });
    });
  }

  it("refuses a comment on someone else's report", async () => {
    reportRow = owned();
    const stranger = crypto.randomUUID();
    const res = await comment(stranger, "citizen");
    expect(res.status).toBe(403);
    expect(writes.some((write) => write.table === "report_updates")).toBe(false);
  });

  it("refuses an empty comment and one over 500 characters", async () => {
    reportRow = owned();
    expect((await comment(ownerOf(), "citizen", "   ")).status).toBe(400);
    expect((await comment(ownerOf(), "citizen", "A".repeat(501))).status).toBe(400);
  });

  it("notifies the assigned staff member and every administrator, once each, and not the citizen", async () => {
    reportRow = owned();
    await comment(ownerOf(), "citizen");
    const ids = notices().map((notice) => notice.user_id).sort();
    expect(ids).toEqual([ADMIN_A, ADMIN_B, STAFF].sort());
    expect(notices()[0]?.message).toBe("The reporter commented on KMT-2026-000300 “Clogged drain”.");
  });

  it("still reaches the administrators when nobody is assigned", async () => {
    reportRow = owned({ assigned_staff: null, status: "pending" });
    await comment(ownerOf(), "citizen");
    expect(notices().map((notice) => notice.user_id).sort()).toEqual([ADMIN_A, ADMIN_B].sort());
  });

  it("logs the comment as the reporter's, not as a staff remark", async () => {
    reportRow = owned();
    await comment(ownerOf(), "citizen");
    const log = writes.find((write) => write.table === "activity_logs")?.payload as { action: string } | undefined;
    expect(log?.action).toBe("report.comment_added");
  });

  it("keeps staff remarks as before: the assignee only, and they reach the citizen", async () => {
    reportRow = owned({ status: "in_progress" });
    const res = await comment(STAFF, "staff", "Crew scheduled for Monday.");
    expect(res.status).toBe(201);
    expect(notices().map((notice) => notice.user_id)).toEqual([ownerOf()]);
  });
});

describe("RS-6 ten comments an hour per citizen", () => {
  it("answers the eleventh comment within the hour with 429 and a plain message", async () => {
    const citizen = "66666666-6666-4666-8666-666666666666";
    reportRow = owned({ citizen: { id: citizen } });
    for (let i = 0; i < 10; i++) expect((await comment(citizen, "citizen")).status).toBe(201);
    const blocked = await comment(citizen, "citizen");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe("You can send up to 10 comments an hour. Try again later.");
  });

  it("counts per account, so another citizen on the same network is not blocked", async () => {
    const other = "77777777-7777-4777-8777-777777777777";
    reportRow = owned({ citizen: { id: other } });
    expect((await comment(other, "citizen")).status).toBe(201);
  });

  it("never throttles staff remarks", async () => {
    reportRow = owned({ status: "in_progress" });
    for (let i = 0; i < 12; i++) expect((await comment(STAFF, "staff", `Update ${i}.`)).status).toBe(201);
  });

  it("is mounted as a shared limiter instance", () => {
    expect(typeof limits.citizenComment).toBe("function");
  });
});

describe("RS-6 history wording and the waiting badge", () => {
  it("calls a citizen's remark a comment from the reporter", () => {
    expect(historyLabel({ update_type: "remark", author: { role: "citizen" } })).toBe("Comment from the reporter");
    expect(historyLabel({ update_type: "remark", author: { role: "staff" } })).toBe("Remark");
    expect(historyLabel({ update_type: "closure_request", author: { role: "staff" } })).toBe("Resolution requested");
    expect(historyLabel({ update_type: "remark", author: null })).toBe("Remark");
  });

  it("treats a request as waiting until it is verified", () => {
    expect(closurePendingOf({ closure_requested_at: null, verified_at: null })).toBe(false);
    expect(closurePendingOf({ closure_requested_at: "2026-10-03T00:00:00Z", verified_at: null })).toBe(true);
    expect(closurePendingOf({ closure_requested_at: "2026-10-03T00:00:00Z", verified_at: "2026-10-04T00:00:00Z" })).toBe(false);
  });
});
