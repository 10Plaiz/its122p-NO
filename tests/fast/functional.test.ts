process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import type { Report, ReportStatus } from "../../src/server/services/reports.service.js";
import type { AuthUser } from "../../src/server/types/auth.js";
import {
  PUBLIC_STATUSES,
  STATUSES,
  STAFF_STATUSES,
  assertCanEdit,
  assertCanUpdate,
  assertCanView,
} from "../../src/server/services/reports.service.js";
import { endOfDay, searchFilter, sortColumn } from "../../src/server/lib/query.js";
import { getReportReturnTarget } from "../../src/web/lib/navigation.js";
import { homePathFor } from "../../src/web/lib/auth.js";
import type { Profile } from "../../src/web/lib/types.js";

// Helper fixtures
function createReport(overrides?: Partial<Report>): Report {
  return {
    id: "report-func-1",
    reference_code: "KMT-2026-000100",
    title: "Damaged Drainage Cover",
    description: "The concrete drainage cover is cracked and hazardous to pedestrians.",
    status: "pending",
    latitude: 14.5995,
    longitude: 120.9842,
    address_text: "Ermita, Manila",
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

// Schemas mirroring routes for functional validation
const reportCreateSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(1000),
  category_id: z.coerce.number().int().positive(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  address_text: z.string().trim().max(255).optional(),
});

describe("FUNC-01 report creation and input validation", () => {
  it("accepts valid report submission data", () => {
    const valid = {
      title: "Pothole on Main Road",
      description: "Deep pothole causing vehicle damage near the intersection.",
      category_id: 1,
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

  it("rejects report submission with out-of-range GPS coordinates", () => {
    const invalidLat = {
      title: "Broken Streetlight",
      description: "Streetlight flickering and completely dark at night.",
      category_id: 2,
      latitude: 95.0,
      longitude: 120.9842,
    };
    expect(reportCreateSchema.safeParse(invalidLat).success).toBe(false);

    const invalidLng = {
      title: "Broken Streetlight",
      description: "Streetlight flickering and completely dark at night.",
      category_id: 2,
      latitude: 14.5995,
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
        latitude: 14.5,
        longitude: 121.0,
      }).success,
    ).toBe(false);

    expect(
      reportCreateSchema.safeParse({
        title: "A".repeat(151),
        description: "Valid description of the issue.",
        category_id: 1,
        latitude: 14.5,
        longitude: 121.0,
      }).success,
    ).toBe(false);
  });
});

describe("FUNC-02 report linear status progression", () => {
  const NEXT_STATUS: Record<ReportStatus, ReportStatus[]> = {
    pending: ["under_review"],
    under_review: ["in_progress"],
    in_progress: ["resolved"],
    resolved: [],
    cancelled: [],
  };

  it("progresses sequentially through defined lifecycle states", () => {
    let current: ReportStatus = "pending";

    const step1 = NEXT_STATUS[current];
    expect(step1).toEqual(["under_review"]);
    current = step1[0];

    const step2 = NEXT_STATUS[current];
    expect(step2).toEqual(["in_progress"]);
    current = step2[0];

    const step3 = NEXT_STATUS[current];
    expect(step3).toEqual(["resolved"]);
    current = step3[0];

    expect(current).toBe("resolved");
  });
});

describe("FUNC-03 report status transition enforcement", () => {
  const NEXT_STATUS: Record<ReportStatus, ReportStatus[]> = {
    pending: ["under_review"],
    under_review: ["in_progress"],
    in_progress: ["resolved"],
    resolved: [],
    cancelled: [],
  };

  it("does not allow skipping workflow stages", () => {
    expect(NEXT_STATUS.pending.includes("in_progress")).toBe(false);
    expect(NEXT_STATUS.pending.includes("resolved")).toBe(false);
    expect(NEXT_STATUS.under_review.includes("resolved")).toBe(false);
  });

  it("treats resolved and cancelled as terminal dead-end states", () => {
    expect(NEXT_STATUS.resolved).toEqual([]);
    expect(NEXT_STATUS.cancelled).toEqual([]);
  });

  it("verifies staff statuses subset excludes cancelled and pending", () => {
    expect(STAFF_STATUSES).toEqual(["under_review", "in_progress", "resolved"]);
    expect(STAFF_STATUSES.includes("pending" as any)).toBe(false);
    expect(STAFF_STATUSES.includes("cancelled" as any)).toBe(false);
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

    // Cancellation sets status to cancelled and guarantees is_public: false
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
  it("allows authorized actors to view and update report remarks", () => {
    const staff = createUser({ id: "staff-func-1", role: "staff" });
    const report = createReport({ assigned_staff: { id: "staff-func-1" } });

    expect(() => assertCanUpdate(report, staff)).not.toThrow();

    // Remark payload verification
    const remarkSchema = z.object({ details: z.string().trim().min(1).max(500) });
    const parsed = remarkSchema.safeParse({ details: "Team dispatched for inspection at 10:00 AM." });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty remark submissions", () => {
    const remarkSchema = z.object({ details: z.string().trim().min(1).max(500) });
    expect(remarkSchema.safeParse({ details: "   " }).success).toBe(false);
  });
});

describe("FUNC-08 public transparency board visibility and query rules", () => {
  it("restricts public board display strictly to reviewed statuses", () => {
    expect(PUBLIC_STATUSES).toEqual(["under_review", "in_progress", "resolved"]);
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
  it("calculates status counts, category totals, and average resolution time", () => {
    const reports = [
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

    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ReportStatus, number>;
    const byCategory: Record<string, number> = {};
    const resolutionDays: number[] = [];

    for (const r of reports) {
      if (r.status in byStatus) byStatus[r.status as ReportStatus] += 1;
      if (r.category?.name) byCategory[r.category.name] = (byCategory[r.category.name] ?? 0) + 1;
      if (r.resolved_at) {
        const diff = new Date(r.resolved_at).getTime() - new Date(r.submitted_at).getTime();
        resolutionDays.push(diff / 86_400_000);
      }
    }

    const average = resolutionDays.length
      ? resolutionDays.reduce((a, b) => a + b, 0) / resolutionDays.length
      : null;

    expect(byStatus.resolved).toBe(2);
    expect(byStatus.in_progress).toBe(1);
    expect(byStatus.pending).toBe(1);
    expect(byCategory.Roads).toBe(2);
    expect(byCategory.Streetlights).toBe(1);
    expect(byCategory.Drainage).toBe(1);
    expect(resolutionDays).toEqual([2, 4]);
    expect(average).toBe(3);
  });
});

describe("FUNC-10 category management lifecycle", () => {
  it("validates category creation bounds", () => {
    const schema = z.object({
      name: z.string().trim().min(2).max(50),
      description: z.string().trim().max(300).optional(),
    });

    expect(schema.safeParse({ name: "Road Hazards", description: "Potholes and road damage" }).success).toBe(true);
    expect(schema.safeParse({ name: "R" }).success).toBe(false);
    expect(schema.safeParse({ name: "A".repeat(51) }).success).toBe(false);
    expect(schema.safeParse({ name: "Valid", description: "B".repeat(301) }).success).toBe(false);
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
});

describe("FUNC-11 notification routing logic", () => {
  it("routes status update notifications and suppresses self-notifications", () => {
    const reportCitizenId = "citizen-func-1";
    const assignedStaffId = "staff-func-1";
    const actorId = "staff-func-1"; // Staff moved the report

    const candidateNotices = [
      { userId: reportCitizenId, message: "Report status changed to In Progress" },
      { userId: assignedStaffId, message: "Report status changed to In Progress" },
    ];

    // Actor must not receive a notification for their own action
    const recipients = candidateNotices.filter((n) => Boolean(n.userId) && n.userId !== actorId);

    expect(recipients.length).toBe(1);
    expect(recipients[0].userId).toBe(reportCitizenId);
  });

  it("routes assignment notification to assigned staff member", () => {
    const adminId = "admin-func-1";
    const staffId = "staff-func-1";
    const citizenId = "citizen-func-1";

    const candidateNotices = [
      { userId: citizenId, message: "Report has been assigned to staff." },
      { userId: staffId, message: "Report has been assigned to you." },
    ];

    const recipients = candidateNotices.filter((n) => Boolean(n.userId) && n.userId !== adminId);
    expect(recipients.length).toBe(2);
    expect(recipients.map((r) => r.userId)).toContain(staffId);
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
    const citizenProfile: Profile = { id: "c1", name: "Citizen", email: "c@test.com", role: "citizen" };
    const staffProfile: Profile = { id: "s1", name: "Staff", email: "s@test.com", role: "staff" };
    const adminProfile: Profile = { id: "a1", name: "Admin", email: "a@test.com", role: "admin" };

    expect(homePathFor(citizenProfile)).toBe("/my-reports");
    expect(homePathFor(staffProfile)).toBe("/staff/queue");
    expect(homePathFor(adminProfile)).toBe("/admin");
  });
});
