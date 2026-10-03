import { Router } from "express";
import { z } from "zod";
import { logReportActivity } from "../lib/activity.js";
import { parse } from "../lib/validate.js";
import { currentUser, requireRole } from "../middleware/auth.js";
import { findReport, present } from "../services/reports.common.js";
import { assertCanUpdate, assertCanView } from "../services/reports.access.js";
import {
  CLOSURE_OUTCOMES,
  STAFF_STATUSES,
  addRemark,
  assignStaff,
  changeStatus,
  findWorkflow,
  presentWorkflow,
  requestClosure,
  reviewClosure,
} from "../services/reports.workflow.js";

// Staff and admin actions on a report: move it forward, assign it, leave remarks,
// request resolution and verify it. Mounted by reports.routes.ts behind
// requireAuth, after its GET /:id, so every GET here has two path segments.
const router = Router();

// Every workflow decision carries a reason (SW-2). The citizen and the next person
// on the report read it in the history, so an empty one is refused.
function comment(missing: string) {
  return z
    .string({ error: missing })
    .trim()
    .min(1, missing)
    .max(500, "Keep comments under 500 characters.");
}

export const statusSchema = z.object({
  status: z.enum(STAFF_STATUSES, {
    error: "Choose the next status. A report in progress is closed by requesting resolution.",
  }),
  details: comment("Enter a comment explaining the change."),
});

export const remarkSchema = z.object({
  details: z.string().trim().min(1, "Enter remark details.").max(500, "Keep remarks under 500 characters."),
});

export const assignSchema = z.object({
  staff_id: z.uuid({ error: "Choose a staff member." }),
  details: comment("Enter a comment for the assignment."),
});

export const closureRequestSchema = z.object({
  outcome: z.enum(CLOSURE_OUTCOMES, { error: "A report can only be sent for verification as resolved." }).default("resolved"),
  details: comment("Describe the work done before requesting resolution."),
});

export const closureReviewSchema = z.object({
  decision: z.enum(["approve", "return"], { error: "Choose to approve or return the request." }),
  details: comment("Enter a comment explaining the decision."),
});

// GET /api/reports/:id/workflow — dates, delay, and any closure request. Anyone
// who may view the report may read it.
router.get("/:id/workflow", async (req, res) => {
  const report = await findReport(req.params.id);
  assertCanView(report, currentUser(req));
  res.json({ workflow: presentWorkflow(report, await findWorkflow(report.id)) });
});

// PATCH /api/reports/:id/status — assigned staff or an admin moves it forward.
router.patch("/:id/status", requireRole("admin", "staff"), async (req, res) => {
  const input = parse(statusSchema, req.body);
  const report = await findReport(req.params.id);
  assertCanUpdate(report, currentUser(req));

  const updated = await changeStatus({
    report,
    user: currentUser(req),
    newStatus: input.status,
    details: input.details,
  });

  await logReportActivity(req, "report.status_changed", report, { from: report.status, to: input.status });
  res.json({ report: present(updated) });
});

// PATCH /api/reports/:id/assign — admins only, per the proposal.
router.patch("/:id/assign", requireRole("admin"), async (req, res) => {
  const { staff_id, details } = parse(assignSchema, req.body);
  const report = await findReport(req.params.id);

  const { report: updated, staff } = await assignStaff({ report, user: currentUser(req), staffId: staff_id, details });

  await logReportActivity(req, "report.assigned", report, {
    staff_id: staff.id,
    staff_name: staff.name,
    previous_staff_id: report.assigned_staff?.id ?? null,
  });
  res.json({ report: present(updated) });
});

// POST /api/reports/:id/remarks — a note on the report without changing status.
router.post("/:id/remarks", requireRole("admin", "staff"), async (req, res) => {
  const { details } = parse(remarkSchema, req.body);
  const report = await findReport(req.params.id);
  assertCanUpdate(report, currentUser(req));

  await addRemark({ report, user: currentUser(req), details });

  await logReportActivity(req, "report.remark_added", report);
  res.status(201).json({ ok: true });
});

// POST /api/reports/:id/closure-request — the assigned staff member says the work
// is done. The report stays in progress until an administrator verifies it.
router.post("/:id/closure-request", requireRole("staff"), async (req, res) => {
  const { outcome, details } = parse(closureRequestSchema, req.body);
  const report = await findReport(req.params.id);

  await requestClosure({ report, user: currentUser(req), outcome, details });

  await logReportActivity(req, "report.closure_requested", report, { outcome });
  res.status(201).json({ workflow: presentWorkflow(report, await findWorkflow(report.id)) });
});

// POST /api/reports/:id/closure-review — an administrator approves the request,
// which closes the report, or returns it to the staff member with a reason.
router.post("/:id/closure-review", requireRole("admin"), async (req, res) => {
  const { decision, details } = parse(closureReviewSchema, req.body);
  const report = await findReport(req.params.id);

  const { report: updated, outcome } = await reviewClosure({ report, user: currentUser(req), decision, details });

  await logReportActivity(
    req,
    decision === "approve" ? "report.closure_approved" : "report.closure_returned",
    report,
    decision === "approve" ? { outcome, to: updated.status } : {},
  );
  res.json({ report: present(updated) });
});

export default router;
