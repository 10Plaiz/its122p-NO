process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Report } from "../../src/server/services/reports.common.js";
import type { WorkflowRow } from "../../src/server/services/reports.workflow.js";
import type { AuthUser } from "../../src/server/types/auth.js";

// Staff workflow (SW-1 to SW-6): the closure request and its verification, required
// comments, delay flags, staff ranking by specialization, and activity labels.
// No live database: the closure flow runs against a recording stand-in for db.from.

const { db } = await import("../../src/server/config/supabase.js");
const server = await import("../../src/server/services/reports.workflow.js");
const { assignSchema, closureRequestSchema, closureReviewSchema, remarkSchema, statusSchema } = await import(
  "../../src/server/routes/reports.workflow.routes.js"
);
const { countOpenLoad, rankStaff, specializationSchema } = await import("../../src/server/routes/staff.routes.js");
const web = await import("../../src/web/lib/types.js");
const { ACTIVITY_LABEL, activityLabel } = await import("../../src/web/lib/activity-labels.js");

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_STAFF_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
const CITIZEN_ID = "44444444-4444-4444-8444-444444444444";

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-wf-1",
    reference_code: "KMT-2026-000200",
    title: "Broken streetlight",
    status: "in_progress",
    is_public: true,
    submitted_at: "2026-09-01T00:00:00.000Z",
    resolved_at: null,
    citizen: { id: CITIZEN_ID },
    assigned_staff: { id: STAFF_ID },
    photos: [{ storage_path: "a.jpg", kind: "resolution" }],
    ...overrides,
  };
}

function user(role: AuthUser["role"], id: string): AuthUser {
  return { id, role, name: `${role} user`, email: `${role}@example.com`, is_active: true };
}

const NO_REQUEST: WorkflowRow = {
  assigned_at: "2026-09-02T00:00:00.000Z",
  status_changed_at: "2026-09-03T00:00:00.000Z",
  closure_requested_at: null,
  closure_outcome: null,
  closure_reason: null,
  verified_at: null,
  closure_requester: null,
  verifier: null,
};

const REQUESTED_AT = "2026-09-10T00:00:00.000Z";
const PENDING_REQUEST: WorkflowRow = {
  ...NO_REQUEST,
  closure_requested_at: REQUESTED_AT,
  closure_outcome: "resolved",
  closure_reason: "Replaced the lamp.",
  closure_requester: { id: STAFF_ID, name: "Staff Member" },
};

describe("WF-01 web mirrors match the server", () => {
  it("offers the same single next step per status", () => {
    for (const status of server.STATUSES) {
      expect(web.NEXT_STATUS[status]).toBe(server.NEXT_STATUS[status][0] ?? null);
      // A step can only be labelled when it exists.
      expect(web.NEXT_STATUS_LABEL[status] === null).toBe(web.NEXT_STATUS[status] === null);
    }
  });

  it("keeps resolved out of the manually settable statuses on both sides", () => {
    expect([...web.STAFF_STATUSES]).toEqual([...server.STAFF_STATUSES]);
    expect(server.NEXT_STATUS.in_progress).toEqual([]);
  });

  it("uses the same closure outcomes and delay thresholds", () => {
    expect([...web.CLOSURE_OUTCOMES]).toEqual([...server.CLOSURE_OUTCOMES]);
    expect(web.DELAY_THRESHOLD_DAYS).toEqual(server.DELAY_THRESHOLD_DAYS);
    expect(web.VERIFICATION_DELAY_DAYS).toBe(server.VERIFICATION_DELAY_DAYS);
  });
});

describe("WF-02 every workflow decision needs a comment (SW-2)", () => {
  it("requires a comment to change status", () => {
    expect(statusSchema.safeParse({ status: "under_review" }).success).toBe(false);
    expect(statusSchema.safeParse({ status: "under_review", details: "  " }).success).toBe(false);
    expect(statusSchema.safeParse({ status: "under_review", details: "Checked on site." }).success).toBe(true);
    const missing = statusSchema.safeParse({ status: "under_review" });
    expect(missing.error?.issues[0]?.message).toBe("Enter a comment explaining the change.");
  });

  it("refuses resolved on the status route with a plain message", () => {
    const result = statusSchema.safeParse({ status: "resolved", details: "Done." });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("requesting resolution");
  });

  it("requires a staff member and a comment to assign", () => {
    expect(assignSchema.safeParse({ staff_id: STAFF_ID }).success).toBe(false);
    expect(assignSchema.safeParse({ staff_id: "nope", details: "Nearest crew." }).success).toBe(false);
    expect(assignSchema.safeParse({ staff_id: STAFF_ID, details: "Nearest crew." }).success).toBe(true);
  });

  it("requires a comment to request closure, as resolved by default or as rejected", () => {
    expect(closureRequestSchema.safeParse({}).success).toBe(false);
    const parsed = closureRequestSchema.parse({ details: "Replaced the lamp." });
    expect(parsed.outcome).toBe("resolved");
    expect(closureRequestSchema.safeParse({ outcome: "rejected", details: "Private property." }).success).toBe(true);
    expect(closureRequestSchema.safeParse({ outcome: "rejected", details: "  " }).success).toBe(false);
    expect(closureRequestSchema.safeParse({ outcome: "deleted", details: "Gone." }).success).toBe(false);
  });

  it("requires a decision and a comment to verify", () => {
    expect(closureReviewSchema.safeParse({ decision: "approve" }).success).toBe(false);
    expect(closureReviewSchema.safeParse({ decision: "maybe", details: "Hmm." }).success).toBe(false);
    expect(closureReviewSchema.safeParse({ decision: "return", details: "Photo is blurry.", requested_at: REQUESTED_AT }).success).toBe(true);
  });

  it("keeps the 500-character cap on every comment", () => {
    const long = "A".repeat(501);
    expect(statusSchema.safeParse({ status: "under_review", details: long }).success).toBe(false);
    expect(closureReviewSchema.safeParse({ decision: "approve", details: long }).success).toBe(false);
    expect(remarkSchema.safeParse({ details: long }).success).toBe(false);
  });
});

describe("WF-03 delay flags (SW-6)", () => {
  const now = new Date("2026-09-20T00:00:00.000Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  it("is on time inside the threshold and delayed past it", () => {
    expect(server.delayState({ status: "pending", statusSince: daysAgo(3) }, now).delayed).toBe(false);
    const late = server.delayState({ status: "pending", statusSince: daysAgo(4) }, now);
    expect(late).toMatchObject({ stage: "pending", delayed: true, days: 4, threshold_days: 3, days_over: 1 });
    expect(server.delayState({ status: "in_progress", statusSince: daysAgo(15) }, now).delayed).toBe(true);
  });

  it("never flags a finished report", () => {
    const done = server.delayState({ status: "resolved", statusSince: daysAgo(400) }, now);
    expect(done).toMatchObject({ delayed: false, threshold_days: null });
    expect(server.delayState({ status: "cancelled", statusSince: daysAgo(400) }, now).delayed).toBe(false);
  });

  it("measures a waiting resolution request against the administrator's threshold", () => {
    const waiting = server.delayState(
      { status: "in_progress", statusSince: daysAgo(30), closureRequestedAt: daysAgo(4), awaitingVerification: true },
      now,
    );
    expect(waiting).toMatchObject({ stage: "awaiting_verification", days: 4, threshold_days: 3, delayed: true });
  });

  it("presents dates, closure state, and the verifier for the workflow route", () => {
    const view = server.presentWorkflow(report(), PENDING_REQUEST, now);
    expect(view.assigned_at).toBe(NO_REQUEST.assigned_at);
    expect(view.status_since).toBe("2026-09-03T00:00:00.000Z");
    expect(view.closure).toMatchObject({ pending: true, outcome: "resolved", requested_by: { name: "Staff Member" } });
    expect(view.delay.stage).toBe("awaiting_verification");
    expect(server.presentWorkflow(report(), NO_REQUEST, now).closure).toBeNull();
  });
});

describe("WF-04 who may request and verify resolution (SW-4)", () => {
  it("lets only the assigned staff member request it", () => {
    expect(() => server.assertCanRequestClosure(report(), user("staff", STAFF_ID), NO_REQUEST)).not.toThrow();
    expect(() => server.assertCanRequestClosure(report(), user("staff", OTHER_STAFF_ID), NO_REQUEST)).toThrow(
      "Only the staff member assigned to this report can ask for it to be closed.",
    );
    expect(() => server.assertCanRequestClosure(report(), user("admin", ADMIN_ID), NO_REQUEST)).toThrow();
  });

  it("needs the report in progress, no request already waiting, and proof of repair", () => {
    const staff = user("staff", STAFF_ID);
    expect(() => server.assertCanRequestClosure(report({ status: "under_review" }), staff, NO_REQUEST)).toThrow(
      "Only a report in progress can be sent for verification.",
    );
    expect(() => server.assertCanRequestClosure(report(), staff, PENDING_REQUEST)).toThrow(
      "This report is already waiting for an administrator to verify it.",
    );
    expect(() =>
      server.assertCanRequestClosure(report({ photos: [{ storage_path: "a.jpg", kind: "initial" }] }), staff, NO_REQUEST),
    ).toThrow("Upload at least one proof-of-repair photo before requesting resolution.");
  });

  it("verifies only a request that is still waiting", () => {
    expect(() => server.assertCanReviewClosure(report(), PENDING_REQUEST, user("admin", ADMIN_ID))).not.toThrow();
    expect(() => server.assertCanReviewClosure(report(), NO_REQUEST, user("admin", ADMIN_ID))).toThrow(
      "This report has no request waiting for verification.",
    );
    expect(() =>
      server.assertCanReviewClosure(report(), { ...PENDING_REQUEST, verified_at: "2026-09-11T00:00:00.000Z" }, user("admin", ADMIN_ID)),
    ).toThrow();
  });
});

// A stand-in for db.from that records each query and answers it from `respond`.
type Call = { table: string; op: string; payload?: unknown; filters: unknown[][] };
type Answer = { data: unknown; error: { message: string } | null };

function fakeDb(respond: (call: Call) => Answer) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      call.filters.push([name, ...args]);
      return builder;
    };
    for (const name of ["eq", "is", "not", "in", "order", "range", "single", "maybeSingle"]) builder[name] = chain(name);
    builder.select = () => builder;
    for (const op of ["insert", "update", "upsert"]) {
      builder[op] = (payload: unknown) => {
        call.op = op;
        call.payload = payload;
        return builder;
      };
    }
    builder.then = (resolve: (value: Answer) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve().then(() => respond(call)).then(resolve, reject);
    return builder;
  };
  const rpc = (name: string, payload: unknown) => {
    const call: Call = { table: name, op: "rpc", payload, filters: [] };
    calls.push(call);
    return Promise.resolve(respond(call));
  };
  return { calls, from, rpc };
}

const originalFrom = db.from.bind(db);
const originalRpc = db.rpc.bind(db);
function useFake(respond: (call: Call) => Answer) {
  const fake = fakeDb(respond);
  (db as unknown as { from: unknown }).from = fake.from;
  (db as unknown as { rpc: unknown }).rpc = fake.rpc;
  return fake.calls;
}
afterEach(() => {
  (db as unknown as { from: unknown }).from = originalFrom;
  (db as unknown as { rpc: unknown }).rpc = originalRpc;
});

const ok = (data: unknown = null): Answer => ({ data, error: null });

describe("WF-04b work needs an assignee before it starts (SW-4)", () => {
  it("refuses to start work on an unassigned report, which nobody could then close", async () => {
    const unassigned = report({ status: "under_review", assigned_staff: null });
    await expect(
      server.changeStatus({ report: unassigned, user: user("admin", ADMIN_ID), newStatus: "in_progress", details: "Go." }),
    ).rejects.toThrow("Assign a staff member before work begins.");
  });
});

function closureReply(status: Report["status"], returned = false) {
  const actionAt = "2026-09-11T00:00:00.000Z";
  return {
    status, resolved_at: status === "resolved" ? actionAt : null, updated_at: actionAt,
    status_changed_at: actionAt, verified_at: returned ? null : actionAt, is_public: true,
    closure_requested_at: returned ? null : REQUESTED_AT,
    closure_outcome: returned ? null : status, closure_reason: returned ? null : "Replaced the lamp.",
  };
}

describe("WF-05 closure actions use the transactional database interface", () => {
  it("sends the assigned actor and outcome to the request transaction", async () => {
    const calls = useFake((call) => ok(call.op === "select" ? NO_REQUEST : null));
    await server.requestClosure({ report: report(), user: user("staff", STAFF_ID), details: "Replaced the lamp.", outcome: "resolved" });
    expect(calls.find((call) => call.op === "rpc")).toMatchObject({
      table: "request_report_closure",
      payload: { p_report_id: "report-wf-1", p_actor_id: STAFF_ID, p_outcome: "resolved", p_details: "Replaced the lamp." },
    });
    expect(calls.some((call) => call.op === "update" || call.op === "insert")).toBe(false);
  });

  it("approves the version viewed by the administrator and returns the committed status", async () => {
    const calls = useFake((call) => ok(call.op === "select" ? PENDING_REQUEST : closureReply("resolved")));
    const result = await server.reviewClosure({ report: report(), user: user("admin", ADMIN_ID),
      decision: "approve", details: "Photo checks out.", requestedAt: REQUESTED_AT, ip: "127.0.0.1" });
    expect(result.report.status).toBe("resolved");
    expect(result.report.resolved_at).toBe(result.report.verified_at);
    expect(calls.find((call) => call.op === "rpc")).toMatchObject({
      table: "review_report_closure", payload: { p_actor_id: ADMIN_ID, p_expected_requested_at: REQUESTED_AT,
        p_decision: "approve", p_details: "Photo checks out.", p_ip: "127.0.0.1" },
    });
    expect(calls.some((call) => call.op === "update" || call.op === "insert")).toBe(false);
  });

  it("returns the pending request through the same transaction", async () => {
    useFake((call) => ok(call.op === "select" ? PENDING_REQUEST : closureReply("in_progress", true)));
    const result = await server.reviewClosure({ report: report(), user: user("admin", ADMIN_ID),
      decision: "return", details: "Photo is blurry.", requestedAt: REQUESTED_AT });
    expect(result.report.status).toBe("in_progress");
    expect(result.report.closure_requested_at).toBeNull();
    expect(result.report.closure_outcome).toBeNull();
  });

  it("answers 409 when the database finds that another administrator decided first", async () => {
    useFake((call) => call.op === "select" ? ok(PENDING_REQUEST) :
      { data: null, error: { code: "PT409", message: "This request was already handled." } });
    await expect(server.reviewClosure({ report: report(), user: user("admin", ADMIN_ID),
      decision: "approve", details: "Fine.", requestedAt: REQUESTED_AT })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a replacement request instead of approving the stale version", async () => {
    const calls = useFake(() => ok({ ...PENDING_REQUEST, closure_requested_at: "2026-09-10T00:00:01.000Z" }));
    await expect(server.reviewClosure({ report: report(), user: user("admin", ADMIN_ID),
      decision: "approve", details: "Fine.", requestedAt: REQUESTED_AT })).rejects.toMatchObject({ status: 409 });
    expect(calls.some((call) => call.op === "rpc")).toBe(false);
  });

  it("rejects self-approval after a requester becomes an administrator", async () => {
    const calls = useFake(() => ok(PENDING_REQUEST));
    await expect(server.reviewClosure({ report: report(), user: user("admin", STAFF_ID),
      decision: "approve", details: "Fine.", requestedAt: REQUESTED_AT })).rejects.toMatchObject({ status: 403 });
    expect(calls.some((call) => call.op === "rpc")).toBe(false);
  });

  it("preserves an invalid-outcome refusal from the database", async () => {
    useFake((call) => call.op === "select" ? ok({ ...PENDING_REQUEST, closure_outcome: null }) :
      { data: null, error: { code: "PT400", message: "Return this request instead." } });
    await expect(server.reviewClosure({ report: report(), user: user("admin", ADMIN_ID),
      decision: "approve", details: "Fine.", requestedAt: REQUESTED_AT })).rejects.toMatchObject({ status: 400 });
  });
});

// SW-7: a report that cannot be fixed is closed as rejected, through the same
// request and verification as a resolution.
const REJECTION_REQUEST: WorkflowRow = {
  ...PENDING_REQUEST,
  closure_outcome: "rejected",
  closure_reason: "The drain is on private property.",
};

describe("WF-08 who may request a rejection (SW-7)", () => {
  const staff = user("staff", STAFF_ID);
  const noProof = { photos: [] };

  it("lets the assigned staff member ask from under review or in progress, without proof of repair", () => {
    for (const status of ["under_review", "in_progress"] as const) {
      expect(() => server.assertCanRequestClosure(report({ status, ...noProof }), staff, NO_REQUEST, "rejected")).not.toThrow();
    }
  });

  it("refuses pending, closed, and cancelled reports", () => {
    for (const status of ["pending", "resolved", "cancelled", "rejected"] as const) {
      expect(() => server.assertCanRequestClosure(report({ status }), staff, NO_REQUEST, "rejected")).toThrow(
        "Only a report under review or in progress can be rejected.",
      );
    }
  });

  it("refuses anyone but the assigned staff member, and a second request", () => {
    expect(() =>
      server.assertCanRequestClosure(report({ status: "under_review" }), user("staff", OTHER_STAFF_ID), NO_REQUEST, "rejected"),
    ).toThrow("Only the staff member assigned to this report can ask for it to be closed.");
    expect(() => server.assertCanRequestClosure(report({ status: "under_review" }), user("admin", ADMIN_ID), NO_REQUEST, "rejected")).toThrow();
    expect(() => server.assertCanRequestClosure(report({ status: "under_review" }), staff, REJECTION_REQUEST, "rejected")).toThrow(
      "This report is already waiting for an administrator to verify it.",
    );
  });

  it("still keeps resolution to in-progress reports with proof", () => {
    expect(() => server.assertCanRequestClosure(report({ status: "under_review" }), staff, NO_REQUEST, "resolved")).toThrow(
      "Only a report in progress can be sent for verification.",
    );
  });

  it("does not start work while a rejection request waits", async () => {
    const waiting = report({
      status: "under_review",
      closure_requested_at: "2026-09-10T00:00:00.000Z",
      verified_at: null,
    });
    await expect(
      server.changeStatus({ report: waiting, user: user("admin", ADMIN_ID), newStatus: "in_progress", details: "Go." }),
    ).rejects.toThrow("This report is waiting for an administrator to verify a request.");
  });

  it("lets an administrator verify a request waiting under review", () => {
    expect(() => server.assertCanReviewClosure(report({ status: "under_review" }), REJECTION_REQUEST, user("admin", ADMIN_ID))).not.toThrow();
    expect(() => server.assertCanReviewClosure(report({ status: "pending" }), REJECTION_REQUEST, user("admin", ADMIN_ID))).toThrow();
  });
});

describe("WF-09 rejection uses the closure transaction", () => {
  it("requests rejection under review without repair photos", async () => {
    const calls = useFake((call) => ok(call.op === "select" ? NO_REQUEST : null));
    await server.requestClosure({ report: report({ status: "under_review", photos: [] }),
      user: user("staff", STAFF_ID), details: "The drain is on private property.", outcome: "rejected" });
    expect(calls.find((call) => call.op === "rpc")?.payload).toMatchObject({
      p_outcome: "rejected", p_details: "The drain is on private property.",
    });
  });
  it("returns a committed rejection with no resolved date", async () => {
    useFake((call) => ok(call.op === "select" ? REJECTION_REQUEST : closureReply("rejected")));
    const result = await server.reviewClosure({ report: report({ status: "under_review" }),
      user: user("admin", ADMIN_ID), decision: "approve", details: "Confirmed with the barangay.", requestedAt: REQUESTED_AT });
    expect(result.report.status).toBe("rejected");
    expect(result.report.resolved_at).toBeNull();
    expect(result.report.is_public).toBe(true);
  });
  it("returns a rejection request without changing the report status", async () => {
    useFake((call) => ok(call.op === "select" ? REJECTION_REQUEST : closureReply("under_review", true)));
    const result = await server.reviewClosure({ report: report({ status: "under_review" }),
      user: user("admin", ADMIN_ID), decision: "return", details: "The barangay says it is public.", requestedAt: REQUESTED_AT });
    expect(result.report.status).toBe("under_review");
    expect(result.report.closure_outcome).toBeNull();
    expect(result.report.closure_reason).toBeNull();
  });
});

describe("WF-06 staff ranking by specialization (SW-1)", () => {
  const roads = { id: 1, name: "Roads" };
  const lights = { id: 2, name: "Streetlights" };
  const staff = [
    { id: "a", name: "Ana", email: "a@x", specializations: [roads], open_load: 5 },
    { id: "b", name: "Ben", email: "b@x", specializations: [lights], open_load: 1 },
    { id: "c", name: "Cara", email: "c@x", specializations: [], open_load: 0 },
    { id: "d", name: "Dan", email: "d@x", specializations: [roads, lights], open_load: 2 },
  ];

  it("lists specialists first, least loaded first, then everyone else", () => {
    const ranked = rankStaff(staff, 1);
    expect(ranked.map((member) => member.name)).toEqual(["Dan", "Ana", "Cara", "Ben"]);
    expect(ranked.map((member) => member.is_specialist)).toEqual([true, true, false, false]);
  });

  it("ranks by open load alone without a category", () => {
    const ranked = rankStaff(staff);
    expect(ranked.map((member) => member.name)).toEqual(["Cara", "Ben", "Dan", "Ana"]);
    expect(ranked.every((member) => !member.is_specialist)).toBe(true);
  });

  it("counts open reports per assignee", () => {
    const load = countOpenLoad([{ assigned_staff_id: "a" }, { assigned_staff_id: "a" }, { assigned_staff_id: null }, { assigned_staff_id: "b" }]);
    expect(load.get("a")).toBe(2);
    expect(load.get("b")).toBe(1);
    expect(load.has("c")).toBe(false);
  });

  it("validates a specialization set", () => {
    expect(specializationSchema.safeParse({ category_ids: [] }).success).toBe(true);
    expect(specializationSchema.safeParse({ category_ids: [1, 2] }).success).toBe(true);
    expect(specializationSchema.safeParse({ category_ids: [1, 1] }).success).toBe(false);
    expect(specializationSchema.safeParse({ category_ids: [0] }).success).toBe(false);
    expect(specializationSchema.safeParse({}).success).toBe(false);
  });
});

describe("WF-07 every logged action has a readable label (SW-3)", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
    });
  }

  it("labels each action string written by the API", () => {
    const actions = new Set<string>();
    for (const file of sourceFiles(join(import.meta.dir, "../../src/server"))) {
      const text = readFileSync(file, "utf8");
      if (!/log(Report)?Activity\(/.test(text) || file.endsWith(join("lib", "activity.ts"))) continue;
      for (const match of text.matchAll(/"([a-z]+\.[a-z_]+)"/g)) {
        if (!/\.(js|ts|json)$/.test(match[1])) actions.add(match[1]);
      }
    }

    expect(actions.size).toBeGreaterThan(5);
    const missing = [...actions].filter((action) => !ACTIVITY_LABEL[action]);
    expect(missing).toEqual([]);
  });

  it("names the new report actions", () => {
    for (const action of [
      "report.status_changed",
      "report.assigned",
      "report.remark_added",
      "report.closure_requested",
      "report.closure_approved",
      "report.closure_returned",
      "staff.specializations_updated",
    ]) {
      expect(ACTIVITY_LABEL[action]).toBeTruthy();
    }
  });

  it("falls back to words for an unknown action", () => {
    expect(activityLabel("example.made_up")).toBe("Example made up");
    expect(activityLabel("")).toBe("Unknown action");
  });
});
