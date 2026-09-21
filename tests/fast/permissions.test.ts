process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "test-secret-key";

import { describe, expect, it } from "bun:test";
import type { Report, ReportStatus } from "../../src/server/services/reports.service.js";
import type { AuthUser } from "../../src/server/types/auth.js";
import { getReportReturnTarget } from "../../src/web/lib/navigation.js";

const { assertCanView, assertCanUpdate, assertCanEdit } = await import(
  "../../src/server/services/reports.service.js"
);

function createReport(overrides?: Partial<Report>): Report {
  return {
    id: "report-1",
    reference_code: "KMT-2026-000001",
    title: "Damaged Pavement",
    status: "pending",
    is_public: false,
    citizen: { id: "citizen-1" },
    assigned_staff: null,
    photos: [],
    ...overrides,
  };
}

function createUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    id: "citizen-1",
    name: "Juan Dela Cruz",
    email: "juan@example.com",
    role: "citizen",
    is_active: true,
    ...overrides,
  };
}

describe("AUTHZ-02 report view authorization", () => {
  it("allows citizen to view their own report", () => {
    const report = createReport({ citizen: { id: "citizen-1" } });
    const user = createUser({ id: "citizen-1", role: "citizen" });

    expect(() => assertCanView(report, user)).not.toThrow();
  });

  it("rejects citizen requesting another citizen's report", () => {
    const report = createReport({ citizen: { id: "citizen-2" } });
    const user = createUser({ id: "citizen-1", role: "citizen" });

    expect(() => assertCanView(report, user)).toThrow("You can only view your own reports.");
  });

  it("allows assigned staff to view their assigned report", () => {
    const report = createReport({
      citizen: { id: "citizen-1" },
      assigned_staff: { id: "staff-1" },
    });
    const user = createUser({ id: "staff-1", role: "staff" });

    expect(() => assertCanView(report, user)).not.toThrow();
  });

  it("rejects staff requesting an unassigned report", () => {
    const report = createReport({
      citizen: { id: "citizen-1" },
      assigned_staff: null,
    });
    const user = createUser({ id: "staff-1", role: "staff" });

    expect(() => assertCanView(report, user)).toThrow("You can only view reports assigned to you.");
  });

  it("rejects staff requesting a report assigned to a different staff member", () => {
    const report = createReport({
      citizen: { id: "citizen-1" },
      assigned_staff: { id: "staff-2" },
    });
    const user = createUser({ id: "staff-1", role: "staff" });

    expect(() => assertCanView(report, user)).toThrow("You can only view reports assigned to you.");
  });

  it("allows administrator to view any report regardless of assignment or ownership", () => {
    const admin = createUser({ id: "admin-1", role: "admin" });
    const unassignedReport = createReport({ citizen: { id: "citizen-1" }, assigned_staff: null });
    const assignedReport = createReport({ citizen: { id: "citizen-2" }, assigned_staff: { id: "staff-1" } });

    expect(() => assertCanView(unassignedReport, admin)).not.toThrow();
    expect(() => assertCanView(assignedReport, admin)).not.toThrow();
  });

  it("rejects unrecognized roles with generic forbidden error", () => {
    const report = createReport();
    const invalidUser = createUser({ id: "unknown-1", role: "guest" as any });

    expect(() => assertCanView(report, invalidUser)).toThrow("You do not have permission to view this report.");
  });
});

describe("AUTHZ-03 report update and remark authorization", () => {
  it("allows administrator to update any report", () => {
    const admin = createUser({ id: "admin-1", role: "admin" });
    const report = createReport({ citizen: { id: "citizen-1" }, assigned_staff: { id: "staff-1" } });

    expect(() => assertCanUpdate(report, admin)).not.toThrow();
  });

  it("allows assigned staff to update their assigned report", () => {
    const staff = createUser({ id: "staff-1", role: "staff" });
    const report = createReport({ citizen: { id: "citizen-1" }, assigned_staff: { id: "staff-1" } });

    expect(() => assertCanUpdate(report, staff)).not.toThrow();
  });

  it("rejects unassigned staff attempting to update a report", () => {
    const staff = createUser({ id: "staff-2", role: "staff" });
    const report = createReport({ citizen: { id: "citizen-1" }, assigned_staff: { id: "staff-1" } });

    expect(() => assertCanUpdate(report, staff)).toThrow("You can only update reports assigned to you.");
  });

  it("rejects staff attempting to update an unassigned report", () => {
    const staff = createUser({ id: "staff-1", role: "staff" });
    const report = createReport({ citizen: { id: "citizen-1" }, assigned_staff: null });

    expect(() => assertCanUpdate(report, staff)).toThrow("You can only update reports assigned to you.");
  });

  it("rejects citizen attempting to update report status or remarks", () => {
    const citizen = createUser({ id: "citizen-1", role: "citizen" });
    const report = createReport({ citizen: { id: "citizen-1" } });

    expect(() => assertCanUpdate(report, citizen)).toThrow("You can only update reports assigned to you.");
  });
});

describe("AUTHZ-04 citizen pending-only report edit authorization", () => {
  it("allows owning citizen to edit a report in pending status", () => {
    const citizen = createUser({ id: "citizen-1", role: "citizen" });
    const report = createReport({ citizen: { id: "citizen-1" }, status: "pending" });

    expect(() => assertCanEdit(report, citizen)).not.toThrow();
  });

  it("rejects non-owning citizen attempting to edit a pending report", () => {
    const otherCitizen = createUser({ id: "citizen-2", role: "citizen" });
    const report = createReport({ citizen: { id: "citizen-1" }, status: "pending" });

    expect(() => assertCanEdit(report, otherCitizen)).toThrow("You can only change your own reports.");
  });

  const NON_PENDING_STATUSES: ReportStatus[] = ["under_review", "in_progress", "resolved", "cancelled"];

  for (const status of NON_PENDING_STATUSES) {
    it(`rejects owning citizen attempting to edit a report in ${status} status`, () => {
      const citizen = createUser({ id: "citizen-1", role: "citizen" });
      const report = createReport({ citizen: { id: "citizen-1" }, status });

      expect(() => assertCanEdit(report, citizen)).toThrow(
        "This report is already being handled and can no longer be changed.",
      );
    });
  }

  it("rejects staff attempting to use citizen edit", () => {
    const staff = createUser({ id: "staff-1", role: "staff" });
    const report = createReport({ citizen: { id: "citizen-1" }, status: "pending" });

    expect(() => assertCanEdit(report, staff)).toThrow("You can only change your own reports.");
  });

  it("rejects admin attempting to use citizen edit", () => {
    const admin = createUser({ id: "admin-1", role: "admin" });
    const report = createReport({ citizen: { id: "citizen-1" }, status: "pending" });

    expect(() => assertCanEdit(report, admin)).toThrow("You can only change your own reports.");
  });
});

describe("AUTHZ-05 role-correct return navigation", () => {
  it("routes Citizen to My reports", () => {
    const target = getReportReturnTarget("citizen");
    expect(target).toEqual({
      to: "/my-reports",
      label: "Back to my reports",
    });
  });

  it("routes Staff to Staff queue", () => {
    const target = getReportReturnTarget("staff");
    expect(target).toEqual({
      to: "/staff/queue",
      label: "Back to staff queue",
    });
  });

  it("routes Administrator to Admin reports", () => {
    const target = getReportReturnTarget("admin");
    expect(target).toEqual({
      to: "/admin/reports",
      label: "Back to admin reports",
    });
  });

  it("defaults undefined or null roles to My reports", () => {
    expect(getReportReturnTarget(undefined)).toEqual({
      to: "/my-reports",
      label: "Back to my reports",
    });
    expect(getReportReturnTarget(null)).toEqual({
      to: "/my-reports",
      label: "Back to my reports",
    });
  });
});
