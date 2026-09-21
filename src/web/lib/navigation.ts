import type { Role } from "./types.js";

export type ReportReturnTarget = {
  to: string;
  label: string;
};

// Returns the role-correct return route and button label for report-detail views.
// Citizens return to My reports, Staff to the Staff queue, and Admins to Admin reports.
export function getReportReturnTarget(role?: Role | null): ReportReturnTarget {
  switch (role) {
    case "admin":
      return { to: "/admin/reports", label: "Back to admin reports" };
    case "staff":
      return { to: "/staff/queue", label: "Back to staff queue" };
    case "citizen":
    default:
      return { to: "/my-reports", label: "Back to my reports" };
  }
}
