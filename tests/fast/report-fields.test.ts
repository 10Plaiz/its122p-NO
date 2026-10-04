process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { afterEach, describe, expect, it } from "bun:test";
import type { Report } from "../../src/server/services/reports.common.js";
import type { AuthUser } from "../../src/server/types/auth.js";

const { db } = await import("../../src/server/config/supabase.js");
const { REPORT_FIELDS, present, problemIdsOf } = await import("../../src/server/services/reports.common.js");
const { cancelReport } = await import("../../src/server/services/reports.submission.js");

function createReport(overrides?: Partial<Report>): Report {
  return {
    id: "report-rf-1",
    reference_code: "KMT-2026-000300",
    title: "Clogged Drain",
    status: "pending",
    is_public: false,
    citizen: { id: "citizen-1" },
    assigned_staff: null,
    photos: [],
    ...overrides,
  };
}

const citizen: AuthUser = { id: "citizen-1", name: "Juan Dela Cruz", email: "juan@example.com", role: "citizen", is_active: true };

// Records what each table was asked to write; every query answers with `data`.
function useFakeDb(data: unknown) {
  const writes: { table: string; update?: unknown; insert?: unknown }[] = [];
  function from(table: string) {
    const write: (typeof writes)[number] = { table };
    writes.push(write);
    const result = { data, error: null };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      update: (row: unknown) => {
        write.update = row;
        return builder;
      },
      insert: (row: unknown) => {
        write.insert = row;
        return builder;
      },
      single: async () => result,
      then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return builder;
  }
  Object.assign(db, { from });
  return writes;
}

const originalFrom = db.from;
afterEach(() => {
  Object.assign(db, { from: originalFrom });
});

describe("REPORT_FIELDS", () => {
  // Lists, tables, and exports read these from the report itself (Phase 2, C1).
  it("carries the workflow columns", () => {
    for (const column of [
      "assigned_at",
      "status_changed_at",
      "closure_requested_at",
      "closure_outcome",
      "closure_reason",
      "verified_at",
    ]) {
      expect(REPORT_FIELDS).toContain(column);
    }
  });

  it("joins both problem types by their foreign keys", () => {
    expect(REPORT_FIELDS).toContain("primary_problem:problem_types!reports_primary_problem_fkey ( id, name )");
    expect(REPORT_FIELDS).toContain("secondary_problem:problem_types!reports_secondary_problem_fkey ( id, name )");
  });

  it("reads whether each photo was purged", () => {
    expect(REPORT_FIELDS).toMatch(/photos:report_photos \([^)]*purged_at[^)]*\)/);
  });
});

describe("present", () => {
  it("gives a kept photo a URL and a purged photo none (DM-2)", () => {
    const report = createReport({
      status: "cancelled",
      photos: [
        { id: 1, storage_path: "r/initial-1.jpg", purged_at: null },
        { id: 2, storage_path: "r/initial-2.jpg", purged_at: "2026-10-01T00:00:00Z" },
      ],
    });
    const [kept, purged] = present(report).photos;
    expect(kept?.url).toContain("r/initial-1.jpg");
    expect(purged?.url).toBeNull();
  });
});

describe("problemIdsOf", () => {
  it("reads the ids from the joined problem rows", () => {
    const report = createReport({
      primary_problem: { id: 4, name: "Pothole" },
      secondary_problem: { id: 7, name: "Cracked pavement" },
    });
    expect(problemIdsOf(report)).toEqual({ primary_problem_id: 4, secondary_problem_id: 7 });
  });

  it("gives nulls for a report filed before problem types existed", () => {
    expect(problemIdsOf(createReport({ primary_problem: null, secondary_problem: null }))).toEqual({
      primary_problem_id: null,
      secondary_problem_id: null,
    });
    expect(problemIdsOf(createReport())).toEqual({ primary_problem_id: null, secondary_problem_id: null });
  });
});

describe("cancelReport", () => {
  // Without it a cancelled report's time in status would run from its last change
  // before cancelling (SW-6).
  it("stamps status_changed_at with the cancellation", async () => {
    const before = Date.now();
    const writes = useFakeDb(createReport({ status: "cancelled" }));
    await cancelReport({ report: createReport(), user: citizen, details: "Fixed by the neighbours." });

    const update = writes.find((write) => write.table === "reports")?.update as Record<string, unknown>;
    expect(update.status).toBe("cancelled");
    expect(update.is_public).toBe(false);
    expect(new Date(update.status_changed_at as string).getTime()).toBeGreaterThanOrEqual(before);
  });
});
