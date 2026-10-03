import { forbidden } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";
import type { Report } from "./reports.common.js";

// Citizens may only view their own reports; assigned staff may only view reports
// assigned to them; admins may view any report.
export function assertCanView(report: Report, user: AuthUser) {
  if (user.role === "admin") return;
  if (user.role === "staff") {
    if (report.assigned_staff?.id === user.id) return;
    throw forbidden("You can only view reports assigned to you.");
  }
  if (user.role === "citizen") {
    if (report.citizen?.id === user.id) return;
    throw forbidden("You can only view your own reports.");
  }
  throw forbidden("You do not have permission to view this report.");
}

// Admins may act on any report; staff only on the ones assigned to them.
export function assertCanUpdate(report: Report, user: AuthUser) {
  if (user.role === "admin") return;
  if (user.role === "staff" && report.assigned_staff?.id === user.id) return;
  throw forbidden("You can only update reports assigned to you.");
}

// A citizen owns their report until staff pick it up. After that it is out of
// their hands, because staff may already be acting on what it says.
export function assertCanEdit(report: Report, user: AuthUser) {
  if (report.citizen.id !== user.id) throw forbidden("You can only change your own reports.");
  if (report.status !== "pending") {
    throw forbidden("This report is already being handled and can no longer be changed.");
  }
}

// The role scope for any list of reports. Applied first and never from user input,
// so a search or filter can only ever narrow what this caller was already allowed
// to see. Citizens see their own, staff see what is assigned to them, admins see all.
export function scopeReportQuery<Q extends { eq(column: string, value: unknown): Q }>(query: Q, user: AuthUser): Q {
  if (user.role === "citizen") return query.eq("citizen_id", user.id);
  if (user.role === "staff") return query.eq("assigned_staff_id", user.id);
  return query;
}
