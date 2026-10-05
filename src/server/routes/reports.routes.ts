import { Router } from "express";
import { z } from "zod";
import type { ParsedQs } from "qs";
import { db } from "../config/supabase.js";
import { badRequest, forbidden, orThrow } from "../lib/errors.js";
import { BARANGAYS, parse } from "../lib/validate.js";
import { photoUpload, photoUrl, savePhoto } from "../lib/photos.js";
import { citizenSubmissionLimit } from "../lib/submission-limits.js";
import { endOfDay, pageFields, searchFields, searchFilter, sortColumn } from "../lib/query.js";
import { currentUser, requireAuth, requireResidency } from "../middleware/auth.js";
import { findReport, present, type Report } from "../services/reports.common.js";
import { REPORT_ROW_FIELDS } from "../services/reports.rows.js";
import { assertCanUpdate, assertCanView, scopeReportQuery } from "../services/reports.access.js";
import { STATUSES } from "../services/reports.workflow.js";
import submissionRoutes from "./reports.submission.routes.js";
import workflowRoutes from "./reports.workflow.routes.js";

// Schemas live next to the routes that use them; re-exported so tests and callers
// can keep importing them from here.
export { createSchema, editSchema } from "./reports.submission.routes.js";
export { remarkSchema, statusSchema } from "./reports.workflow.routes.js";

const router = Router();
// UA-8: a citizen locked to the proof upload reaches none of this.
router.use(requireAuth, requireResidency);

const listSchema = z.object({
  ...searchFields,
  ...pageFields(20, 50),
  status: z.enum(STATUSES).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  // SW-1: the barangay the pin is in (set by the database from the pin).
  barangay: z.enum(BARANGAYS).optional(),
});

// GET /api/reports — one handler, scoped by role.
// Citizens see their own, staff see what is assigned to them, admins see all.
router.get("/", async (req, res) => {
  const { status, category_id, barangay, q, from, to, sort, page, per_page } = parse(listSchema, req.query);
  const order = sortColumn(sort);

  let query = db
    .from("reports")
    .select(REPORT_ROW_FIELDS, { count: "exact" })
    .order(order.column, { ascending: order.ascending })
    .range((page - 1) * per_page, page * per_page - 1);

  // The role scope is applied first and never from user input, so a search or filter
  // can only ever narrow what this caller was already allowed to see.
  query = scopeReportQuery(query, currentUser(req));
  if (status) query = query.eq("status", status);
  if (category_id) query = query.eq("category_id", category_id);
  if (barangay) query = query.eq("barangay", barangay);
  if (from) query = query.gte("submitted_at", from);
  if (to) query = query.lte("submitted_at", endOfDay(to));

  const search = q && searchFilter(q);
  if (search) query = query.or(search);

  const result = await query;
  const reports = orThrow(result, "Reports could not be loaded.");

  res.json({ reports: (reports as unknown as Report[]).map(present), page, per_page, total: result.count ?? 0 });
});

router.get("/:id", async (req, res) => {
  const report = await findReport(req.params.id);
  assertCanView(report, currentUser(req));
  res.json({ report: present(report) });
});

router.get("/:id/updates", async (req, res) => {
  const report = await findReport(req.params.id);
  assertCanView(report, currentUser(req));

  const updates = orThrow(
    await db
      .from("report_updates")
      .select("id, update_type, previous_status, new_status, details, created_at, author:profiles ( id, name, role )")
      .eq("report_id", report.id)
      .order("created_at", { ascending: false }),
    "The report history could not be loaded.",
  );

  res.json({ updates });
});

// POST /api/reports/:id/photos — the citizen adds evidence, staff add proof of repair.
type PhotoResponseLocals = { photoAdmission: { report: Report; kind: "initial" | "resolution" } };
router.post<{ id: string }, unknown, unknown, ParsedQs, PhotoResponseLocals>("/:id/photos", async (req, res, next) => {
  const report = await findReport(req.params.id);
  const isOwner = report.citizen.id === currentUser(req).id;
  if (isOwner) {
    if (report.status !== "pending") {
      throw forbidden("Photos can only be added while the report is still pending.");
    }
  } else {
    assertCanUpdate(report, currentUser(req));
  }
  res.locals.photoAdmission = { report, kind: isOwner ? "initial" : "resolution" };
  next();
}, citizenSubmissionLimit("report.photo"), photoUpload.single("photo"), async (req, res) => {
  if (!req.file) throw badRequest("Attach a photo file in the `photo` field.");
  const { report, kind } = res.locals.photoAdmission;
  const photo = await savePhoto({
    file: req.file,
    reportId: report.id,
    uploadedBy: currentUser(req).id,
    kind,
  });

  res.status(201).json({ photo: { ...photo, url: photoUrl(photo.storage_path) } });
});

// Citizen actions (file, edit, cancel) and staff/admin actions (status, assign,
// remarks). Their paths and methods never overlap the routes above.
router.use(submissionRoutes);
router.use(workflowRoutes);

export default router;
