process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, it } from "bun:test";
import type { Report } from "../../src/web/lib/types.js";

// C6 (B6, B9): the extra table and export columns, the table's copy of the delay
// rule, and the activity log filters shared by the screen and the export.

const { delayOf } = await import("../../src/web/lib/delay.js");
const server = await import("../../src/server/services/reports.workflow.js");
const { reportColumn } = await import("../../src/web/components/data-table/report-columns.js");
const { formatDate } = await import("../../src/web/components/ui.js");
const { applyLogFilters, logSelect } = await import("../../src/server/lib/log-filters.js");
const { logQuerySchema } = await import("../../src/server/routes/admin.routes.js");
const { logExportSchema } = await import("../../src/server/routes/exports.routes.js");

const NOW = new Date("2026-10-20T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function row(overrides: Partial<Report> & Record<string, unknown> = {}): Report {
  return {
    id: "r-1",
    reference_code: "KMT-2026-000400",
    title: "Broken streetlight",
    description: "Dark for a week.",
    status: "in_progress",
    latitude: 14.5547,
    longitude: 121.0244,
    address_text: null,
    is_public: true,
    submitted_at: daysAgo(30),
    updated_at: daysAgo(1),
    resolved_at: null,
    assigned_at: daysAgo(20),
    status_changed_at: daysAgo(15),
    closure_requested_at: null,
    closure_outcome: null,
    closure_reason: null,
    verified_at: null,
    category: { id: 1, name: "Streetlight" },
    primary_problem: { id: 4, name: "Lamp out" },
    secondary_problem: { id: 7, name: "Exposed wiring" },
    citizen: { id: "c-1", name: "Juan", email: "juan@example.com", contact_number: null, phone_verified_at: null, residency_status: "verified" },
    assigned_staff: { id: "s-1", name: "Staff", email: "staff@example.com" },
    photos: [],
    ...overrides,
  } as Report;
}

describe("C6 the table's delay rule matches the staff page (SW-6)", () => {
  const cases: [string, Partial<Report>][] = [
    ["in progress past 14 days", { status: "in_progress", status_changed_at: daysAgo(15) }],
    ["in progress inside 14 days", { status: "in_progress", status_changed_at: daysAgo(3) }],
    ["pending past 3 days", { status: "pending", status_changed_at: daysAgo(4) }],
    ["under review on day 5", { status: "under_review", status_changed_at: daysAgo(5) }],
    ["waiting on an administrator for 4 days", { closure_requested_at: daysAgo(4), status_changed_at: daysAgo(30) }],
    ["a verified request is no longer waiting", { status: "resolved", closure_requested_at: daysAgo(9), verified_at: daysAgo(8), resolved_at: daysAgo(8), status_changed_at: daysAgo(8) }],
    ["rejected is never delayed", { status: "rejected", status_changed_at: daysAgo(60), closure_requested_at: daysAgo(61), verified_at: daysAgo(60) }],
  ];

  for (const [name, overrides] of cases) {
    it(name, () => {
      const report = row(overrides);
      const pending = Boolean(report.closure_requested_at) && !report.verified_at;
      const expected = server.delayState(
        {
          status: report.status,
          statusSince: report.status_changed_at ?? report.submitted_at,
          closureRequestedAt: report.closure_requested_at,
          awaitingVerification: pending,
        },
        NOW,
      );
      expect(delayOf(report, NOW)).toEqual({ days: expected.days, delayed: expected.delayed });
    });
  }
});

describe("C6 report columns export what the cell shows (B6)", () => {
  it("status says when a request waits", () => {
    const waiting = row({ status: "under_review", status_changed_at: new Date().toISOString(), closure_requested_at: new Date().toISOString() });
    expect(reportColumn.status.exportValue(waiting)).toBe("Awaiting verification");
    const fresh = row({ status: "in_progress", status_changed_at: new Date().toISOString() });
    expect(reportColumn.status.exportValue(fresh)).toBe("In progress");
  });

  it("status adds the delay once past the threshold", () => {
    const late = row({ status: "pending", status_changed_at: new Date(Date.now() - 10 * 86_400_000).toISOString() });
    expect(reportColumn.status.exportValue(late)).toBe("Pending, delayed 10 days");
  });

  it("lists both problems, main first, and nothing for a report filed before problem types", () => {
    expect(reportColumn.problems.exportValue(row())).toBe("Lamp out, Exposed wiring");
    expect(reportColumn.problems.exportValue(row({ primary_problem: null, secondary_problem: null }))).toBe("");
  });

  it("shows the closed date for resolved and rejected reports only", () => {
    const resolvedAt = "2026-10-10T08:00:00.000Z";
    expect(reportColumn.completed.exportValue(row({ status: "resolved", resolved_at: resolvedAt }))).toBe(formatDate(resolvedAt));
    expect(reportColumn.completed.exportValue(row({ status: "rejected", verified_at: resolvedAt }))).toBe(formatDate(resolvedAt));
    expect(reportColumn.completed.exportValue(row())).toBe("");
    expect(reportColumn.completed.header).toBe("Closed");
  });

  it("gives the rating as a number, or empty when there is none", () => {
    expect(reportColumn.rating.exportValue(row({ feedback: { rating: 4 } }))).toBe("4");
    expect(reportColumn.rating.exportValue(row({ feedback: null }))).toBe("");
    expect(reportColumn.rating.exportValue(row())).toBe("");
  });

  it("describes the reporter's residency and phone in words", () => {
    expect(reportColumn.residency.exportValue(row())).toBe("Verified");
    const noProof = row({ citizen: { id: "c", name: "A", email: "a@b.c", contact_number: null, phone_verified_at: null, residency_status: null } });
    expect(reportColumn.residency.exportValue(noProof)).toBe("No proof");
    expect(reportColumn.phoneVerified.exportValue(row())).toBe("No");
  });

  it("keeps the new columns optional, so existing tables look the same until chosen", () => {
    for (const column of [reportColumn.problems, reportColumn.assignedOn, reportColumn.daysInStage, reportColumn.residency, reportColumn.phoneVerified, reportColumn.rating]) {
      expect(column.defaultHidden).toBe(true);
    }
  });
});

describe("C6 activity log filters (B9)", () => {
  it("accepts the screen's filters and rejects anything that is not a plain value", () => {
    expect(logQuerySchema.safeParse({ action: "report.assigned", role: "staff", reference: "KMT-2026", from: "2026-10-01", to: "2026-10-31" }).success).toBe(true);
    expect(logQuerySchema.safeParse({ action: "report.assigned,id.eq.1" }).success).toBe(false);
    expect(logQuerySchema.safeParse({ reference: "KMT,or(id" }).success).toBe(false);
    expect(logQuerySchema.safeParse({ role: "superuser" }).success).toBe(false);
    expect(logQuerySchema.safeParse({ from: "yesterday" }).success).toBe(false);
  });

  it("lets the export take the same filters as the screen", () => {
    const parsed = logExportSchema.parse({ format: "pdf", action: "report.assigned", reference: "" });
    expect(parsed).toMatchObject({ format: "pdf", action: "report.assigned" });
    expect(parsed.reference).toBeUndefined();
  });

  it("joins the actor's profile strictly only when filtering by role", () => {
    expect(logSelect({})).toContain("actor:profiles ( id, name, role )");
    expect(logSelect({ role: "staff" })).toContain("actor:profiles!inner ( id, name, role )");
  });

  it("applies each filter to the query, and none when none are given", () => {
    const calls: unknown[][] = [];
    const builder = {
      eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
      ilike: (...args: unknown[]) => (calls.push(["ilike", ...args]), builder),
      gte: (...args: unknown[]) => (calls.push(["gte", ...args]), builder),
      lte: (...args: unknown[]) => (calls.push(["lte", ...args]), builder),
    };
    applyLogFilters(builder, {});
    expect(calls).toEqual([]);

    applyLogFilters(builder, { action: "report.assigned", role: "staff", reference: "0004", from: "2026-10-01", to: "2026-10-31" });
    expect(calls).toEqual([
      ["eq", "action", "report.assigned"],
      ["eq", "actor.role", "staff"],
      ["ilike", "metadata->>reference_code", "%0004%"],
      ["gte", "created_at", "2026-10-01"],
      ["lte", "created_at", "2026-10-31T23:59:59.999Z"],
    ]);
  });
});
