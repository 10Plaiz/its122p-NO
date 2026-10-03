process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { afterEach, describe, expect, it } from "bun:test";
import type { Report } from "../../src/server/services/reports.common.js";
import type { AuthUser } from "../../src/server/types/auth.js";

const { db } = await import("../../src/server/config/supabase.js");
const { ApiError } = await import("../../src/server/lib/errors.js");
const { ALREADY_RATED, assertCanRate, createFeedback, feedbackNotice, summarizeFeedback } = await import(
  "../../src/server/services/feedback.service.js"
);
const { default: feedbackRouter, feedbackSchema, summaryQuerySchema } = await import(
  "../../src/server/routes/feedback.routes.js"
);
const { RATINGS, RATING_LABEL, validateFeedback } = await import("../../src/web/lib/feedback.js");

function createReport(overrides?: Partial<Report>): Report {
  return {
    id: "report-fb-1",
    reference_code: "KMT-2026-000200",
    title: "Broken Streetlight",
    status: "resolved",
    is_public: true,
    citizen: { id: "citizen-1" },
    assigned_staff: { id: "staff-1" },
    photos: [],
    ...overrides,
  };
}

function createUser(overrides?: Partial<AuthUser>): AuthUser {
  return { id: "citizen-1", name: "Juan Dela Cruz", email: "juan@example.com", role: "citizen", is_active: true, ...overrides };
}

// A stand-in for the Supabase client: every query builder method returns the
// builder, and awaiting it (or calling single/maybeSingle) yields the result the
// test queued for that table. Inserts are recorded so a test can check them.
type Result = { data: unknown; error: { message: string; code?: string } | null };
type Call = { table: string; insert?: unknown };

function fakeDb(results: Record<string, Result[]>) {
  const calls: Call[] = [];
  const next = (table: string): Result => results[table]?.shift() ?? { data: null, error: null };

  function from(table: string) {
    const call: Call = { table };
    calls.push(call);
    let result: Result | undefined;
    const take = () => (result ??= next(table));
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      insert: (row: unknown) => {
        call.insert = row;
        return builder;
      },
      single: async () => take(),
      maybeSingle: async () => take(),
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(take()).then(resolve, reject),
    };
    return builder;
  }

  return { from, calls };
}

const originalFrom = db.from;
const originalRpc = db.rpc;

function useFakeDb(results: Record<string, Result[]>) {
  const fake = fakeDb(results);
  Object.assign(db, { from: fake.from });
  return fake.calls;
}

afterEach(() => {
  Object.assign(db, { from: originalFrom, rpc: originalRpc });
});

const saved = { id: "fb-1", report_id: "report-fb-1", rating: 4, comment: null, created_at: "2026-10-02T00:00:00Z" };

describe("FB-1 feedback input", () => {
  it("accepts a whole rating from 1 to 5 with an optional comment", () => {
    expect(feedbackSchema.safeParse({ rating: 1 }).success).toBe(true);
    expect(feedbackSchema.safeParse({ rating: 5, comment: "Fixed in two days." }).success).toBe(true);
  });

  it("rejects ratings outside 1 to 5, fractions, and strings", () => {
    for (const rating of [0, 6, 2.5, "3", null]) {
      expect(feedbackSchema.safeParse({ rating }).success).toBe(false);
    }
    expect(feedbackSchema.safeParse({}).success).toBe(false);
  });

  it("limits the comment to 500 characters and treats a blank comment as none", () => {
    expect(feedbackSchema.safeParse({ rating: 3, comment: "a".repeat(500) }).success).toBe(true);
    expect(feedbackSchema.safeParse({ rating: 3, comment: "a".repeat(501) }).success).toBe(false);
    const blank = feedbackSchema.parse({ rating: 3, comment: "   " });
    expect(blank.comment).toBeUndefined();
  });

  it("accepts only a UUID as the summary staff_id", () => {
    expect(summaryQuerySchema.safeParse({}).success).toBe(true);
    expect(summaryQuerySchema.safeParse({ staff_id: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(summaryQuerySchema.safeParse({ staff_id: "staff-1" }).success).toBe(false);
  });

  it("mirrors the server rules in the web form", () => {
    expect(validateFeedback({ rating: null, comment: "" })).toEqual({ rating: "Choose a rating from 1 to 5." });
    expect(validateFeedback({ rating: 4, comment: "a".repeat(501) })).toEqual({
      comment: "Keep the comment under 500 characters.",
    });
    expect(validateFeedback({ rating: 4, comment: "" })).toEqual({});
    // Every rating has a visible word, so the scale never relies on colour alone.
    for (const rating of RATINGS) expect(RATING_LABEL[rating].length).toBeGreaterThan(0);
  });
});

describe("FB-1 who may rate", () => {
  it("allows the citizen who filed a resolved report", () => {
    expect(() => assertCanRate(createReport(), createUser())).not.toThrow();
  });

  it("rejects another citizen, staff, and admins", () => {
    const report = createReport();
    expect(() => assertCanRate(report, createUser({ id: "citizen-2" }))).toThrow("You can only rate your own reports.");
    expect(() => assertCanRate(report, createUser({ id: "staff-1", role: "staff" }))).toThrow(
      "You can only rate your own reports.",
    );
    expect(() => assertCanRate(report, createUser({ id: "admin-1", role: "admin" }))).toThrow(
      "You can only rate your own reports.",
    );
  });

  it("rejects a report that is not resolved yet", () => {
    for (const status of ["pending", "under_review", "in_progress", "cancelled"] as const) {
      expect(() => assertCanRate(createReport({ status }), createUser())).toThrow(
        "You can rate this report once it is resolved.",
      );
    }
  });
});

describe("FB-1 routing the rating to staff", () => {
  it("tells the assigned staff member, naming the report", () => {
    expect(feedbackNotice(createReport(), 4)).toEqual({
      userId: "staff-1",
      message: "KMT-2026-000200 “Broken Streetlight” was rated 4 out of 5 by the reporter.",
    });
  });

  it("tells nobody when the report was never assigned", () => {
    expect(feedbackNotice(createReport({ assigned_staff: null }), 4)).toBeUndefined();
  });

  it("saves the rating and notifies the assignee", async () => {
    const calls = useFakeDb({
      report_feedback: [{ data: null, error: null }, { data: saved, error: null }],
      notifications: [{ data: null, error: null }],
    });

    const feedback = await createFeedback({ report: createReport(), user: createUser(), rating: 4 });

    expect(feedback).toEqual(saved);
    expect(calls.find((call) => call.table === "report_feedback" && call.insert)?.insert).toEqual({
      report_id: "report-fb-1",
      citizen_id: "citizen-1",
      staff_id: "staff-1",
      rating: 4,
      comment: null,
    });
    expect(calls.find((call) => call.table === "notifications")?.insert).toEqual({
      user_id: "staff-1",
      report_id: "report-fb-1",
      message: "KMT-2026-000200 “Broken Streetlight” was rated 4 out of 5 by the reporter.",
    });
  });

  it("keeps the saved rating when the notification fails", async () => {
    useFakeDb({
      report_feedback: [{ data: null, error: null }, { data: saved, error: null }],
      notifications: [{ data: null, error: { message: "insert failed" } }],
    });
    const logged = console.error;
    console.error = () => {};
    try {
      const feedback = await createFeedback({ report: createReport(), user: createUser(), rating: 4 });
      expect(feedback).toEqual(saved);
    } finally {
      console.error = logged;
    }
  });

  it("skips the notification when nobody is assigned", async () => {
    const calls = useFakeDb({
      report_feedback: [{ data: null, error: null }, { data: saved, error: null }],
    });

    await createFeedback({ report: createReport({ assigned_staff: null }), user: createUser(), rating: 2, comment: "Slow." });

    expect(calls.some((call) => call.table === "notifications")).toBe(false);
    const insert = calls.find((call) => call.insert)?.insert as { staff_id: unknown; comment: unknown };
    expect(insert.staff_id).toBeNull();
    expect(insert.comment).toBe("Slow.");
  });

  it("refuses a second rating with a plain 409", async () => {
    const calls = useFakeDb({ report_feedback: [{ data: saved, error: null }] });

    const attempt = createFeedback({ report: createReport(), user: createUser(), rating: 5 });
    await expect(attempt).rejects.toThrow(ALREADY_RATED);
    await attempt.catch((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as InstanceType<typeof ApiError>).status).toBe(409);
    });
    expect(calls.some((call) => call.insert)).toBe(false);
  });

  it("turns a lost race on the unique index into the same 409", async () => {
    useFakeDb({
      report_feedback: [
        { data: null, error: null },
        { data: null, error: { message: "duplicate key value", code: "23505" } },
      ],
    });

    const attempt = createFeedback({ report: createReport(), user: createUser(), rating: 5 });
    await expect(attempt).rejects.toThrow(ALREADY_RATED);
  });

  it("checks permission before touching the database", async () => {
    const calls = useFakeDb({});
    const attempt = createFeedback({ report: createReport({ status: "in_progress" }), user: createUser(), rating: 5 });
    await expect(attempt).rejects.toThrow("You can rate this report once it is resolved.");
    expect(calls).toHaveLength(0);
  });
});

describe("FB-1 rating summary", () => {
  it("returns the average and count from the database function", async () => {
    let args: unknown;
    Object.assign(db, {
      rpc: async (_name: string, params: unknown) => {
        args = params;
        return { data: [{ average: "4.25", total: "4" }], error: null };
      },
    });

    expect(await summarizeFeedback("staff-1")).toEqual({ staff_id: "staff-1", average: 4.25, count: 4 });
    expect(args).toEqual({ p_staff_id: "staff-1" });
  });

  it("reports no average when there are no ratings", async () => {
    Object.assign(db, { rpc: async () => ({ data: [{ average: null, total: 0 }], error: null }) });
    expect(await summarizeFeedback(null)).toEqual({ staff_id: null, average: null, count: 0 });
  });
});

describe("FB-1 route order", () => {
  it("registers /summary/staff before /:reportId so 'summary' is never a report id", () => {
    type Layer = { route?: { path: string; methods: Record<string, boolean> } };
    const getPaths = (feedbackRouter.stack as Layer[])
      .filter((layer) => layer.route?.methods.get)
      .map((layer) => layer.route!.path);

    expect(getPaths.indexOf("/summary/staff")).toBeGreaterThanOrEqual(0);
    expect(getPaths.indexOf("/summary/staff")).toBeLessThan(getPaths.indexOf("/:reportId"));
  });
});
