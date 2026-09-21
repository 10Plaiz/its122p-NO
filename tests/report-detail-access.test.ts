import { describe, expect, it } from "bun:test";
import { assertCanView, type Report } from "../src/server/services/reports.service.js";
import type { AuthUser } from "../src/server/types/auth.js";
import { getReportReturnTarget } from "../src/web/lib/navigation.js";

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

describe("assertCanView (protected report-detail authorization)", () => {
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

  it("rejects unrecognized roles", () => {
    const report = createReport();
    const invalidUser = createUser({ id: "unknown-1", role: "guest" as any });

    expect(() => assertCanView(report, invalidUser)).toThrow("You do not have permission to view this report.");
  });
});

describe("getReportReturnTarget (role-correct return navigation)", () => {
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
