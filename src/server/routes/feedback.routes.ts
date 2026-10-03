import { Router } from "express";
import { z } from "zod";
import { logActivity } from "../lib/activity.js";
import { forbidden } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { currentUser, requireAuth, requireRole, requireResidency } from "../middleware/auth.js";
import { createFeedback, findFeedback, summarizeFeedback } from "../services/feedback.service.js";
import { findReport } from "../services/reports.common.js";
import { assertCanView } from "../services/reports.access.js";

// Citizen feedback (rating and comment) on resolved reports. FB-1.
const router = Router();
// UA-8: a citizen locked to the proof upload reaches none of this.
router.use(requireAuth, requireResidency);

export const feedbackSchema = z.object({
  rating: z
    .number("Choose a rating from 1 to 5.")
    .int("Choose a rating from 1 to 5.")
    .min(1, "Choose a rating from 1 to 5.")
    .max(5, "Choose a rating from 1 to 5."),
  // An empty or whitespace-only comment is the same as no comment.
  comment: z
    .string()
    .trim()
    .max(500, "Keep the comment under 500 characters.")
    .optional()
    .transform((value) => value || undefined),
});

export const summaryQuerySchema = z.object({
  staff_id: z.uuid("Choose a valid staff member.").optional(),
});

// GET /api/feedback/summary/staff — a staff member's own average, or for an admin
// any staff member's (?staff_id=) or everyone's (no staff_id).
// Registered before "/:reportId" so "summary" is never read as a report id.
router.get("/summary/staff", requireRole("staff", "admin"), async (req, res) => {
  const { staff_id } = parse(summaryQuerySchema, req.query);
  const user = currentUser(req);

  if (user.role === "staff" && staff_id && staff_id !== user.id) {
    throw forbidden("You can only see your own ratings.");
  }

  const staffId = user.role === "staff" ? user.id : (staff_id ?? null);
  res.json({ summary: await summarizeFeedback(staffId) });
});

// GET /api/feedback/:reportId — the rating, or null when there is none yet.
// Whoever may view the report (owner, assignee, admin) may see its rating.
router.get("/:reportId", async (req, res) => {
  const report = await findReport(req.params.reportId);
  assertCanView(report, currentUser(req));
  res.json({ feedback: await findFeedback(report.id) });
});

// POST /api/feedback/:reportId — the reporter rates their resolved report, once.
router.post("/:reportId", async (req, res) => {
  const input = parse(feedbackSchema, req.body);
  const report = await findReport(req.params.reportId);

  const feedback = await createFeedback({ report, user: currentUser(req), rating: input.rating, comment: input.comment });

  await logActivity(req, "feedback.created", {
    entityType: "report",
    entityId: report.id,
    metadata: { report: report.reference_code, rating: input.rating },
  });

  res.status(201).json({ feedback });
});

export default router;
