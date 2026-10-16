process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, it } from "bun:test";
import { countFilterOptions } from "../../src/web/lib/filter-counts.js";
import { STATUS_FILTERS as WEB_STATUS_FILTERS, STATUS_FILTER_LABEL, statusFilterValues } from "../../src/web/lib/status-filter.js";

const { STATUS_FILTERS, filterReportStatus } = await import("../../src/server/services/reports.workflow.js");
const { listSchema } = await import("../../src/server/routes/reports.routes.js");
const { reportExportSchema } = await import("../../src/server/routes/exports.routes.js");

// Records the filters a route would send to PostgREST.
function recordingQuery() {
  const calls: unknown[][] = [];
  const query = {
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
    in: (...args: unknown[]) => (calls.push(["in", ...args]), query),
    not: (...args: unknown[]) => (calls.push(["not", ...args]), query),
    is: (...args: unknown[]) => (calls.push(["is", ...args]), query),
  };
  return { query, calls };
}

const pendingClosure = { closure_requested_at: "2026-10-16T01:00:00Z", verified_at: null };
const noRequest = { closure_requested_at: null, verified_at: null };

describe("#82 Awaiting verification filter", () => {
  it("lists only reports whose closure request no Administrator has decided", () => {
    const { query, calls } = recordingQuery();
    expect(filterReportStatus(query, "awaiting_verification")).toBe(query);
    expect(calls).toEqual([
      ["in", "status", ["under_review", "in_progress"]],
      ["not", "closure_requested_at", "is", null],
      ["is", "verified_at", null],
    ]);
  });

  it("filters a stored status by that status alone, so In progress still lists waiting reports", () => {
    const { query, calls } = recordingQuery();
    filterReportStatus(query, "in_progress");
    expect(calls).toEqual([["eq", "status", "in_progress"]]);
  });

  it("is accepted by the report list and the export, and the screen offers the same choices", () => {
    expect(listSchema.parse({ status: "awaiting_verification" }).status).toBe("awaiting_verification");
    expect(reportExportSchema.parse({ status: "awaiting_verification" }).status).toBe("awaiting_verification");
    expect(() => listSchema.parse({ status: "awaiting" })).toThrow();
    expect([...WEB_STATUS_FILTERS]).toEqual([...STATUS_FILTERS]);
    expect(STATUS_FILTER_LABEL.awaiting_verification).toBe("Awaiting verification");
  });

  it("counts a waiting report under its status and under Awaiting verification", () => {
    expect(statusFilterValues({ status: "in_progress", ...pendingClosure })).toEqual(["in_progress", "awaiting_verification"]);
    expect(statusFilterValues({ status: "under_review", ...pendingClosure })).toEqual(["under_review", "awaiting_verification"]);
    expect(statusFilterValues({ status: "in_progress", ...noRequest })).toEqual(["in_progress"]);
    // An approved request closed the report; nothing is waiting.
    expect(statusFilterValues({ status: "resolved", closure_requested_at: "2026-10-16T01:00:00Z", verified_at: "2026-10-16T02:00:00Z" })).toEqual(["resolved"]);
    // The public board has no closure fields.
    expect(statusFilterValues({ status: "in_progress" })).toEqual(["in_progress"]);
  });

  it("gives the option a count, and narrows the other filters' counts when chosen", () => {
    const rows = [
      { id: 1, values: { status: statusFilterValues({ status: "in_progress", ...pendingClosure }), barangay: "Poblacion" } },
      { id: 2, values: { status: statusFilterValues({ status: "in_progress", ...noRequest }), barangay: "Poblacion" } },
      { id: 3, values: { status: statusFilterValues({ status: "pending", ...noRequest }), barangay: "Bel-Air" } },
    ];

    const any = countFilterOptions(rows, { status: "", barangay: "" });
    expect(any.status?.all).toBe(3);
    expect(any.status?.values.get("in_progress")).toBe(2);
    expect(any.status?.values.get("awaiting_verification")).toBe(1);

    const waiting = countFilterOptions(rows, { status: "awaiting_verification", barangay: "" });
    expect(waiting.barangay?.all).toBe(1);
    expect(waiting.barangay?.values.get("Poblacion")).toBe(1);
    expect(waiting.barangay?.values.get("Bel-Air")).toBeUndefined();
  });
});
