import { Router } from "express";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { orThrow } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { refineInsideMakati } from "../lib/makati.js";
import { photoUpload, savePhoto } from "../lib/photos.js";
import { currentUser, requireRole } from "../middleware/auth.js";
import { findReport, present, problemIdsOf } from "../services/reports.common.js";
import { assertCanEdit } from "../services/reports.access.js";
import {
  PROBLEMS_DIFFER,
  assertCategorySelectable,
  assertProblemEditValid,
  assertProblemsSelectable,
  cancelReport,
  editReport,
  listProblemTypes,
  notifyNewReport,
  resolveProblemEdit,
} from "../services/reports.submission.js";

// Citizen actions on a report: file, correct, withdraw. Mounted by reports.routes.ts
// behind requireAuth, after its GET /:id — so every GET here has at least two path
// segments, or GET /:id would answer it first.
const router = Router();

export const PRIMARY_PROBLEM_ERROR = "Choose the main problem.";
export const SECONDARY_PROBLEM_ERROR = "Choose the other problem from the list.";
export const PRIMARY_PROBLEM_AGAIN_ERROR = "Choose the main problem again for the new category.";
export const CANCEL_REASON_ERROR = "Give a reason for withdrawing this report.";
export const CANCEL_REASON_MAX_ERROR = "Keep the reason under 500 characters.";

// A problem type id. `error` also covers a missing or non-numeric value, which zod
// would otherwise describe as "expected number, received NaN".
const problemId = (message: string) => z.coerce.number({ error: message }).int(message).positive(message);

// Every field of a report, without the rules that tie fields together. Kept apart so
// createSchema and editSchema share one definition of each field.
const reportFields = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Give the report a title of at least 3 characters.")
    .max(150, "Keep the title under 150 characters."),
  description: z
    .string()
    .trim()
    .min(10, "Describe the problem in at least 10 characters.")
    .max(1000, "Keep the description under 1000 characters."),
  category_id: z.coerce
    .number({ error: "Choose the category that fits best." })
    .int("Choose the category that fits best.")
    .positive("Choose the category that fits best."),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  address_text: z.string().trim().max(255, "Keep the address under 255 characters.").nullable().optional(),
  // RS-4: the main problem is required, another one is optional.
  primary_problem_id: problemId(PRIMARY_PROBLEM_ERROR),
  secondary_problem_id: problemId(SECONDARY_PROBLEM_ERROR).nullable().optional(),
});

type ProblemPair = { primary_problem_id?: number; secondary_problem_id?: number | null };
const problemsDiffer = (input: ProblemPair) =>
  input.secondary_problem_id == null || input.secondary_problem_id !== input.primary_problem_id;

// Multipart form fields arrive as strings, so numbers are coerced here. Mirrored by
// validateReportFields and pinError in src/web/lib/report-rules.ts, message for
// message. MP-2: the pin must be inside Makati's boundary, not just on the globe.
export const createSchema = reportFields
  .refine(problemsDiffer, { path: ["secondary_problem_id"], message: PROBLEMS_DIFFER })
  .superRefine(refineInsideMakati);

// A citizen may correct any of these while the report is still pending. A new
// category invalidates the problems chosen for the old one, so it must come with a
// new main problem.
export const editSchema = reportFields
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Send at least one field to change.")
  .refine((changes) => changes.category_id === undefined || changes.primary_problem_id !== undefined, {
    path: ["primary_problem_id"],
    message: PRIMARY_PROBLEM_AGAIN_ERROR,
  })
  .refine(problemsDiffer, { path: ["secondary_problem_id"], message: PROBLEMS_DIFFER })
  // A moved pin is checked; an edit that leaves the pin alone is not, so a report
  // filed before this rule can still have its title corrected.
  .superRefine(refineInsideMakati);

// SW-2: a withdrawal always says why. `error` covers a body with no reason at all.
export const cancelSchema = z.object({
  details: z
    .string({ error: CANCEL_REASON_ERROR })
    .trim()
    .min(1, CANCEL_REASON_ERROR)
    .max(500, CANCEL_REASON_MAX_ERROR),
});

// GET /api/reports/meta/problem-types — the problem types a citizen may choose,
// grouped by category id.
router.get("/meta/problem-types", async (_req, res) => {
  res.json({ groups: await listProblemTypes() });
});

// POST /api/reports — citizens file a report, optionally with one photo.
router.post("/", requireRole("citizen"), photoUpload.single("photo"), async (req, res) => {
  const input = parse(createSchema, req.body);
  await assertCategorySelectable(input.category_id);
  await assertProblemsSelectable(input.category_id, {
    primary_problem_id: input.primary_problem_id,
    secondary_problem_id: input.secondary_problem_id,
  });

  const created = orThrow(
    await db
      .from("reports")
      .insert({ ...input, citizen_id: currentUser(req).id })
      .select("id")
      .single(),
    "Your report could not be submitted.",
  );

  if (req.file) {
    await savePhoto({
      file: req.file,
      reportId: created.id,
      uploadedBy: currentUser(req).id,
      kind: "initial",
    });
  }

  const report = await findReport(created.id);
  await notifyNewReport(report);

  res.status(201).json({ report: present(report) });
});

// PATCH /api/reports/:id — the citizen corrects their own pending report.
router.patch("/:id", requireRole("citizen"), async (req, res) => {
  const { primary_problem_id, secondary_problem_id, ...fields } = parse(editSchema, req.body);
  const report = await findReport(req.params.id);
  assertCanEdit(report, currentUser(req));

  const currentCategoryId = (report.category as { id: number } | null)?.id;
  const categoryChanged = fields.category_id !== undefined && fields.category_id !== currentCategoryId;

  // Only when the edit actually moves the report to another category. A report already
  // filed under one that has since been retired keeps it untouched.
  if (categoryChanged) await assertCategorySelectable(fields.category_id!);

  const before = problemIdsOf(report);
  const { write, errors } = resolveProblemEdit(before, { primary_problem_id, secondary_problem_id }, categoryChanged);
  assertProblemEditValid(errors);

  // Only the problems this edit sends are checked: one already on the report may
  // have been retired since, and keeping it is not choosing it.
  const categoryId = fields.category_id ?? currentCategoryId;
  if (categoryId !== undefined) {
    await assertProblemsSelectable(categoryId, { primary_problem_id, secondary_problem_id });
  }

  const changes = { ...fields, ...write };
  res.json({ report: present(await editReport({ report, user: currentUser(req), changes, before })) });
});

// POST /api/reports/:id/cancel — withdraw a pending report. The row is kept.
router.post("/:id/cancel", requireRole("citizen"), async (req, res) => {
  const { details } = parse(cancelSchema, req.body ?? {});
  const report = await findReport(req.params.id);
  assertCanEdit(report, currentUser(req));

  res.json({ report: present(await cancelReport({ report, user: currentUser(req), details })) });
});

export default router;
