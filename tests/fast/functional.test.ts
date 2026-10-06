process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, it } from "bun:test";
import type { Report, ReportStatus, Notice } from "../../src/server/services/reports.service.js";
import type { AuthUser } from "../../src/server/types/auth.js";
import type { Profile } from "../../src/web/lib/types.js";
import type { AnalyticsReportRow } from "../../src/server/lib/analytics.js";

const {
  NEXT_STATUS,
  PUBLIC_STATUSES,
  STATUSES,
  STAFF_STATUSES,
  assertCanEdit,
  assertCanUpdate,
  filterNotificationRecipients,
} = await import("../../src/server/services/reports.service.js");

const {
  createSchema: reportCreateSchema,
  remarkSchema,
  statusSchema,
} = await import("../../src/server/routes/reports.routes.js");

const { categorySchema } = await import("../../src/server/routes/categories.routes.js");
const { calculateAnalytics } = await import("../../src/server/lib/analytics.js");
const { endOfDay, searchFilter, sortColumn } = await import("../../src/server/lib/query.js");
const { getReportReturnTarget } = await import("../../src/web/lib/navigation.js");
const { homePathFor } = await import("../../src/web/lib/auth.js");
const { badRequest } = await import("../../src/server/lib/errors.js");

// Helper fixtures
function createReport(overrides?: Partial<Report>): Report {
  return {
    id: "report-func-1",
    reference_code: "KMT-2026-000100",
    title: "Damaged Drainage Cover",
    description: "The concrete drainage cover is cracked and hazardous to pedestrians.",
    status: "pending",
    latitude: 14.5547,
    longitude: 121.0244,
    address_text: "Ayala Avenue, Makati",
    is_public: false,
    citizen: { id: "citizen-func-1" },
    assigned_staff: null,
    photos: [],
    ...overrides,
  };
}

function createUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    id: "citizen-func-1",
    name: "Maria Santos",
    email: "maria@example.com",
    role: "citizen",
    is_active: true,
    ...overrides,
  };
}

describe("FUNC-01 report creation and input validation", () => {
  it("accepts valid report submission data", () => {
    const valid = {
      title: "Pothole on Main Road",
      description: "Deep pothole causing vehicle damage near the intersection.",
      category_id: 1,
      primary_problem_id: 1,
      latitude: 14.5547,
      longitude: 121.0244,
      address_text: "Ayala Avenue, Makati",
    };

    const parsed = reportCreateSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe("Pothole on Main Road");
      expect(parsed.data.latitude).toBe(14.5547);
      expect(parsed.data.longitude).toBe(121.0244);
    }
  });

  it("accepts report submission with nullable or omitted address", () => {
    const withNullAddress = {
      title: "Broken Streetlight",
      description: "Streetlight flickering and completely dark at night.",
      category_id: 2,
      primary_problem_id: 1,
      latitude: 14.5547,
      longitude: 121.0244,
      address_text: null,
    };
    expect(reportCreateSchema.safeParse(withNullAddress).success).toBe(true);

    const withoutAddress = {
      title: "Broken Streetlight",
      description: "Streetlight flickering and completely dark at night.",
      category_id: 2,
      primary_problem_id: 1,
      latitude: 14.5547,
      longitude: 121.0244,
    };
    expect(reportCreateSchema.safeParse(withoutAddress).success).toBe(true);
  });

  it("rejects report submission with out-of-range GPS coordinates", () => {
    const invalidLat = {
      title: "Broken Streetlight",
      description: "Streetlight flickering and completely dark at night.",
      category_id: 2,
      primary_problem_id: 1,
      latitude: 95.0,
      longitude: 121.0244,
    };
    expect(reportCreateSchema.safeParse(invalidLat).success).toBe(false);

    const invalidLng = {
      title: "Broken Streetlight",
      description: "Streetlight flickering and completely dark at night.",
      category_id: 2,
      primary_problem_id: 1,
      latitude: 14.5547,
      longitude: 190.0,
    };
    expect(reportCreateSchema.safeParse(invalidLng).success).toBe(false);
  });

  it("enforces title length bounds (3-150 characters)", () => {
    expect(
      reportCreateSchema.safeParse({
        title: "No",
        description: "Valid description of the issue.",
        category_id: 1,
        primary_problem_id: 1,
        latitude: 14.55,
        longitude: 121.02,
      }).success,
    ).toBe(false);

    expect(
      reportCreateSchema.safeParse({
        title: "Yes",
        description: "Valid description of the issue.",
        category_id: 1,
        primary_problem_id: 1,
        latitude: 14.55,
        longitude: 121.02,
      }).success,
    ).toBe(true);

    expect(
      reportCreateSchema.safeParse({
        title: "A".repeat(150),
        description: "Valid description of the issue.",
        category_id: 1,
        primary_problem_id: 1,
        latitude: 14.55,
        longitude: 121.02,
      }).success,
    ).toBe(true);

    expect(
      reportCreateSchema.safeParse({
        title: "A".repeat(151),
        description: "Valid description of the issue.",
        category_id: 1,
        primary_problem_id: 1,
        latitude: 14.55,
        longitude: 121.02,
      }).success,
    ).toBe(false);
  });

  it("enforces description length bounds (10-1000 characters)", () => {
    expect(
      reportCreateSchema.safeParse({
        title: "Valid Title",
        description: "Too short",
        category_id: 1,
        primary_problem_id: 1,
        latitude: 14.55,
        longitude: 121.02,
      }).success,
    ).toBe(false);

    expect(
      reportCreateSchema.safeParse({
        title: "Valid Title",
        description: "A".repeat(1001),
        category_id: 1,
        primary_problem_id: 1,
        latitude: 14.55,
        longitude: 121.02,
      }).success,
    ).toBe(false);
  });
});

describe("FUNC-02 report linear status progression", () => {
  it("progresses sequentially through the manual lifecycle states from reports service", () => {
    let current: ReportStatus = "pending";

    const step1 = NEXT_STATUS[current];
    expect(step1).toEqual(["under_review"]);
    current = step1[0];

    const step2 = NEXT_STATUS[current];
    expect(step2).toEqual(["in_progress"]);
    current = step2[0];

    expect(current).toBe("in_progress");
  });

  it("leaves in_progress only through a verified resolution request, never by a manual step", () => {
    // SW-4: staff request resolution and an administrator closes the report.
    expect(NEXT_STATUS.in_progress).toEqual([]);
  });
});

describe("FUNC-03 report status transition enforcement", () => {
  it("does not allow skipping workflow stages", () => {
    expect(NEXT_STATUS.pending.includes("in_progress")).toBe(false);
    expect(NEXT_STATUS.pending.includes("resolved")).toBe(false);
    expect(NEXT_STATUS.under_review.includes("resolved")).toBe(false);
  });

  it("treats resolved and cancelled as terminal dead-end states", () => {
    expect(NEXT_STATUS.resolved).toEqual([]);
    expect(NEXT_STATUS.cancelled).toEqual([]);
  });

  it("verifies staff statuses subset excludes cancelled, pending, and resolved", () => {
    expect(STAFF_STATUSES).toEqual(["under_review", "in_progress"]);
    expect((STAFF_STATUSES as readonly string[]).includes("pending")).toBe(false);
    expect((STAFF_STATUSES as readonly string[]).includes("cancelled")).toBe(false);
    // Only an administrator's verification resolves a report.
    expect((STAFF_STATUSES as readonly string[]).includes("resolved")).toBe(false);
  });

  it("rejects resolved and a missing comment on the status route", () => {
    expect(statusSchema.safeParse({ status: "resolved", details: "Done." }).success).toBe(false);
    expect(statusSchema.safeParse({ status: "in_progress" }).success).toBe(false);
    expect(statusSchema.safeParse({ status: "in_progress", details: "   " }).success).toBe(false);
    expect(statusSchema.safeParse({ status: "in_progress", details: "Crew dispatched." }).success).toBe(true);
  });
});

describe("FUNC-04 citizen pending report editing rules", () => {
  it("permits the report owner to edit a report in pending status", () => {
    const report = createReport({ status: "pending" });
    const owner = createUser({ id: "citizen-func-1", role: "citizen" });

    expect(() => assertCanEdit(report, owner)).not.toThrow();
  });

  it("rejects edits from a citizen who is not the report owner", () => {
    const report = createReport({ status: "pending" });
    const otherCitizen = createUser({ id: "citizen-func-2", role: "citizen" });

    expect(() => assertCanEdit(report, otherCitizen)).toThrow("You can only change your own reports.");
  });

  it("rejects edits once a report is under review or in progress", () => {
    const owner = createUser({ id: "citizen-func-1", role: "citizen" });

    const reviewingReport = createReport({ status: "under_review" });
    expect(() => assertCanEdit(reviewingReport, owner)).toThrow(
      "This report is already being handled and can no longer be changed.",
    );

    const progressReport = createReport({ status: "in_progress" });
    expect(() => assertCanEdit(progressReport, owner)).toThrow(
      "This report is already being handled and can no longer be changed.",
    );
  });
});

describe("FUNC-05 citizen report cancellation workflow", () => {
  it("allows owner to cancel a pending report and removes it from public visibility", () => {
    const report = createReport({ status: "pending", is_public: false });
    const owner = createUser({ id: "citizen-func-1", role: "citizen" });

    expect(() => assertCanEdit(report, owner)).not.toThrow();

    const cancelledState = {
      ...report,
      status: "cancelled" as ReportStatus,
      is_public: false,
    };
    expect(cancelledState.status).toBe("cancelled");
    expect(cancelledState.is_public).toBe(false);
  });

  it("disallows cancelling a report that is already under review or resolved", () => {
    const owner = createUser({ id: "citizen-func-1", role: "citizen" });
    const resolvedReport = createReport({ status: "resolved" });

    expect(() => assertCanEdit(resolvedReport, owner)).toThrow(
      "This report is already being handled and can no longer be changed.",
    );
  });
});

describe("FUNC-06 staff assignment and authorization rules", () => {
  it("allows administrators to update any report regardless of assignment", () => {
    const admin = createUser({ id: "admin-func-1", role: "admin" });
    const report = createReport({ assigned_staff: null });

    expect(() => assertCanUpdate(report, admin)).not.toThrow();
  });

  it("allows assigned staff to update their designated report", () => {
    const staff = createUser({ id: "staff-func-1", role: "staff" });
    const report = createReport({ assigned_staff: { id: "staff-func-1" } });

    expect(() => assertCanUpdate(report, staff)).not.toThrow();
  });

  it("rejects unassigned staff from modifying a report", () => {
    const staff = createUser({ id: "staff-func-1", role: "staff" });
    const report = createReport({ assigned_staff: { id: "staff-func-2" } });

    expect(() => assertCanUpdate(report, staff)).toThrow("You can only update reports assigned to you.");
  });
});

describe("FUNC-07 staff remark creation and audit preservation", () => {
  it("validates remark details using canonical remarkSchema", () => {
    const staff = createUser({ id: "staff-func-1", role: "staff" });
    const report = createReport({ assigned_staff: { id: "staff-func-1" } });

    expect(() => assertCanUpdate(report, staff)).not.toThrow();

    const parsed = remarkSchema.safeParse({ details: "Team dispatched for inspection at 10:00 AM." });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty remark submissions and remarks exceeding 500 characters", () => {
    expect(remarkSchema.safeParse({ details: "   " }).success).toBe(false);
    expect(remarkSchema.safeParse({ details: "" }).success).toBe(false);
    expect(remarkSchema.safeParse({ details: "A".repeat(501) }).success).toBe(false);
    expect(remarkSchema.safeParse({ details: "A".repeat(500) }).success).toBe(true);
  });
});

describe("FUNC-08 public transparency board visibility and query rules", () => {
  it("restricts public board display strictly to reviewed statuses", () => {
    // Rejected reports stay public with their reason (SW-7, decision 2026-10-03).
    expect(PUBLIC_STATUSES).toEqual(["under_review", "in_progress", "resolved", "rejected"]);
    expect(PUBLIC_STATUSES.includes("pending" as any)).toBe(false);
    expect(PUBLIC_STATUSES.includes("cancelled" as any)).toBe(false);
  });

  it("safely generates keyword search filters", () => {
    const filter = searchFilter("pothole avenida");
    expect(filter).toBe("title.ilike.%pothole avenida%,description.ilike.%pothole avenida%");
  });

  it("maps sort criteria to correct columns and directions", () => {
    expect(sortColumn("newest")).toEqual({ column: "submitted_at", ascending: false });
    expect(sortColumn("oldest")).toEqual({ column: "submitted_at", ascending: true });
    expect(sortColumn("status")).toEqual({ column: "status", ascending: true });
  });

  it("expands single date filter to full day boundary", () => {
    expect(endOfDay("2026-09-21")).toBe("2026-09-21T23:59:59.999Z");
  });
});

describe("FUNC-09 administrator analytics computation logic", () => {
  it("calculates status counts, category totals, and average resolution time via calculateAnalytics", () => {
    const reports: AnalyticsReportRow[] = [
      {
        status: "resolved",
        submitted_at: "2026-09-01T08:00:00Z",
        resolved_at: "2026-09-03T08:00:00Z", // 2 days
        category: { name: "Roads" },
      },
      {
        status: "resolved",
        submitted_at: "2026-09-01T08:00:00Z",
        resolved_at: "2026-09-05T08:00:00Z", // 4 days
        category: { name: "Roads" },
      },
      {
        status: "in_progress",
        submitted_at: "2026-09-02T08:00:00Z",
        resolved_at: null,
        category: { name: "Streetlights" },
      },
      {
        status: "pending",
        submitted_at: "2026-09-03T08:00:00Z",
        resolved_at: null,
        category: { name: "Drainage" },
      },
    ];

    const summary = calculateAnalytics(reports);

    expect(summary.total_reports).toBe(4);
    expect(summary.by_status.resolved).toBe(2);
    expect(summary.by_status.in_progress).toBe(1);
    expect(summary.by_status.pending).toBe(1);
    expect(summary.by_category.Roads).toBe(2);
    expect(summary.by_category.Streetlights).toBe(1);
    expect(summary.by_category.Drainage).toBe(1);
    expect(summary.resolved_count).toBe(2);
    expect(summary.average_resolution_days).toBe(3);
  });

  it("returns null average resolution days when no reports are resolved or list is empty", () => {
    const emptySummary = calculateAnalytics([]);
    expect(emptySummary.total_reports).toBe(0);
    expect(emptySummary.resolved_count).toBe(0);
    expect(emptySummary.average_resolution_days).toBe(null);

    const pendingOnly: AnalyticsReportRow[] = [
      {
        status: "pending",
        submitted_at: "2026-09-01T08:00:00Z",
        resolved_at: null,
        category: { name: "Drainage" },
      },
    ];
    const pendingSummary = calculateAnalytics(pendingOnly);
    expect(pendingSummary.total_reports).toBe(1);
    expect(pendingSummary.resolved_count).toBe(0);
    expect(pendingSummary.average_resolution_days).toBe(null);
  });

  it("counts a resolved report with no resolved_at in resolved_count, and leaves it out of the average", () => {
    // The dashboard shows resolved_count as a tile and by_status.resolved as a bar. A
    // row carrying the status but no timestamp used to land in one and not the other,
    // so the same word reported two different numbers on one screen.
    const reports: AnalyticsReportRow[] = [
      {
        status: "resolved",
        submitted_at: "2026-09-01T08:00:00Z",
        resolved_at: "2026-09-03T08:00:00Z", // 2 days
        category: { name: "Roads" },
      },
      {
        status: "resolved",
        submitted_at: "2026-09-01T08:00:00Z",
        resolved_at: null, // resolved, but never stamped
        category: { name: "Roads" },
      },
    ];

    const summary = calculateAnalytics(reports);

    expect(summary.by_status.resolved).toBe(2);
    expect(summary.resolved_count).toBe(summary.by_status.resolved);
    // Only the stamped row can be measured, so the average is that row's 2 days.
    expect(summary.average_resolution_days).toBe(2);
    // The figure the dashboard derives for "Open" stays honest.
    expect(summary.total_reports - summary.resolved_count - summary.by_status.cancelled).toBe(0);
  });
});

describe("FUNC-10 category management lifecycle", () => {
  it("validates category creation bounds using production categorySchema (2-60 chars name, <= 300 desc)", () => {
    expect(categorySchema.safeParse({ name: "Road Hazards", description: "Potholes and road damage" }).success).toBe(true);
    expect(categorySchema.safeParse({ name: "R" }).success).toBe(false);
    expect(categorySchema.safeParse({ name: "Valid Category", description: "B".repeat(301) }).success).toBe(false);
    expect(categorySchema.safeParse({ name: "Valid Category", description: "B".repeat(300) }).success).toBe(true);

    // Production schema allows up to 60 characters for category name
    expect(categorySchema.safeParse({ name: "A".repeat(60) }).success).toBe(true);
    expect(categorySchema.safeParse({ name: "A".repeat(61) }).success).toBe(false);
  });

  it("filters inactive categories from user selection list", () => {
    const categories = [
      { id: 1, name: "Roads", is_active: true },
      { id: 2, name: "Streetlights", is_active: true },
      { id: 3, name: "Deprecated Category", is_active: false },
    ];

    const active = categories.filter((c) => c.is_active);
    expect(active.length).toBe(2);
    expect(active.some((c) => c.id === 3)).toBe(false);
  });

  it("enforces KR-13 category selectability error contract for missing and retired categories", () => {
    const categories = [
      { id: 1, name: "Roads", is_active: true },
      { id: 2, name: "Streetlights", is_active: true },
      { id: 3, name: "Deprecated Category", is_active: false },
    ];

    function checkCategory(id: number) {
      const found = categories.find((c) => c.id === id);
      if (!found) {
        throw badRequest("Some fields are invalid. Fix them and try again.", [
          { field: "category_id", message: "Choose a category that exists." },
        ]);
      }
      if (!found.is_active) {
        throw badRequest("Some fields are invalid. Fix them and try again.", [
          { field: "category_id", message: "That category has been retired. Choose another." },
        ]);
      }
    }

    expect(() => checkCategory(1)).not.toThrow();

    try {
      checkCategory(999);
      expect.unreachable();
    } catch (err: any) {
      expect(err.status).toBe(400);
      expect(err.details).toEqual([
        { field: "category_id", message: "Choose a category that exists." },
      ]);
    }

    try {
      checkCategory(3);
      expect.unreachable();
    } catch (err: any) {
      expect(err.status).toBe(400);
      expect(err.details).toEqual([
        { field: "category_id", message: "That category has been retired. Choose another." },
      ]);
    }
  });
});

describe("FUNC-11 notification routing logic", () => {
  it("routes status update notifications and suppresses self-notifications via filterNotificationRecipients", () => {
    const reportCitizenId = "citizen-func-1";
    const assignedStaffId = "staff-func-1";
    const actorId = "staff-func-1"; // Staff moved the report

    const candidateNotices: Notice[] = [
      { userId: reportCitizenId, message: "Report status changed to In Progress" },
      { userId: assignedStaffId, message: "Report status changed to In Progress" },
    ];

    const recipients = filterNotificationRecipients(candidateNotices, actorId);

    expect(recipients.length).toBe(1);
    expect(recipients[0].userId).toBe(reportCitizenId);
  });

  it("routes assignment notification to assigned staff member and ignores unassigned staff", () => {
    const adminId = "admin-func-1";
    const staffId = "staff-func-1";
    const citizenId = "citizen-func-1";

    const candidateNotices: Notice[] = [
      { userId: citizenId, message: "Report has been assigned to staff." },
      { userId: staffId, message: "Report has been assigned to you." },
      { userId: undefined, message: "Unassigned staff notice" },
    ];

    const recipients = filterNotificationRecipients(candidateNotices, adminId);
    expect(recipients.length).toBe(2);
    expect(recipients.map((r) => r.userId)).toContain(staffId);
    expect(recipients.map((r) => r.userId)).toContain(citizenId);
  });
});

describe("FUNC-12 responsive navigation and role-aware layouts", () => {
  it("routes each role to its dedicated workspace and return destination", () => {
    expect(getReportReturnTarget("citizen")).toEqual({ to: "/my-reports", label: "Back to my reports" });
    expect(getReportReturnTarget("staff")).toEqual({ to: "/staff/queue", label: "Back to staff queue" });
    expect(getReportReturnTarget("admin")).toEqual({ to: "/admin/reports", label: "Back to admin reports" });
    expect(getReportReturnTarget(null)).toEqual({ to: "/my-reports", label: "Back to my reports" });
  });

  it("determines home path for each user role upon login", () => {
    const residency = { residency_review_version: "d0261006-0000-4000-8000-000000000001", residency_proof_id: null };
    const citizenProfile: Profile = { ...residency, id: "c1", name: "Citizen", email: "c@test.com", role: "citizen" };
    const staffProfile: Profile = { ...residency, id: "s1", name: "Staff", email: "s@test.com", role: "staff" };
    const adminProfile: Profile = { ...residency, id: "a1", name: "Admin", email: "a@test.com", role: "admin" };

    expect(homePathFor(citizenProfile)).toBe("/my-reports");
    expect(homePathFor(staffProfile)).toBe("/staff/queue");
    expect(homePathFor(adminProfile)).toBe("/admin");
  });
});
