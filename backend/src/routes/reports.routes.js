import { Router } from "express";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { badRequest, forbidden, orThrow } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { photoUpload, photoUrl, savePhoto } from "../lib/photos.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  REPORT_FIELDS,
  STAFF_STATUSES,
  STATUSES,
  addRemark,
  assertCanEdit,
  assertCanUpdate,
  assertCanView,
  assignStaff,
  cancelReport,
  changeStatus,
  editReport,
  findReport,
} from "../services/reports.service.js";

const router = Router();
router.use(requireAuth);

// Replaces stored object keys with URLs the frontend can put in an <img src>.
function present(report) {
  return {
    ...report,
    photos: (report.photos ?? []).map((photo) => ({ ...photo, url: photoUrl(photo.storage_path) })),
  };
}

// Multipart form fields arrive as strings, so numbers are coerced here.
const createSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10, "Describe the problem in at least 10 characters."),
  category_id: z.coerce.number().int().positive(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  address_text: z.string().trim().max(255).optional(),
});

const listSchema = z.object({
  status: z.enum(STATUSES).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(50).default(20),
});

// A citizen may correct any of these while the report is still pending.
const editSchema = createSchema.partial().refine(
  (changes) => Object.keys(changes).length > 0,
  "Send at least one field to change.",
);

const statusSchema = z.object({
  status: z.enum(STAFF_STATUSES),
  details: z.string().trim().max(500).optional(),
});

// GET /api/reports — one handler, scoped by role.
// Citizens see their own, staff see what is assigned to them, admins see all.
router.get("/", async (req, res) => {
  const { status, category_id, page, per_page } = parse(listSchema, req.query);

  let query = db
    .from("reports")
    .select(REPORT_FIELDS, { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range((page - 1) * per_page, page * per_page - 1);

  if (req.user.role === "citizen") query = query.eq("citizen_id", req.user.id);
  if (req.user.role === "staff") query = query.eq("assigned_staff_id", req.user.id);
  if (status) query = query.eq("status", status);
  if (category_id) query = query.eq("category_id", category_id);

  const result = await query;
  const reports = orThrow(result, "Reports could not be loaded.");

  res.json({ reports: reports.map(present), page, per_page, total: result.count ?? 0 });
});

// POST /api/reports — citizens file a report, optionally with one photo.
router.post("/", requireRole("citizen"), photoUpload.single("photo"), async (req, res) => {
  const input = parse(createSchema, req.body);

  const created = orThrow(
    await db
      .from("reports")
      .insert({ ...input, citizen_id: req.user.id })
      .select("id")
      .single(),
    "Your report could not be submitted.",
  );

  if (req.file) {
    await savePhoto({
      file: req.file,
      reportId: created.id,
      uploadedBy: req.user.id,
      kind: "initial",
    });
  }

  res.status(201).json({ report: present(await findReport(created.id)) });
});

router.get("/:id", async (req, res) => {
  const report = await findReport(req.params.id);
  assertCanView(report, req.user);
  res.json({ report: present(report) });
});

router.get("/:id/updates", async (req, res) => {
  const report = await findReport(req.params.id);
  assertCanView(report, req.user);

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

// PATCH /api/reports/:id — the citizen corrects their own pending report.
router.patch("/:id", requireRole("citizen"), async (req, res) => {
  const changes = parse(editSchema, req.body);
  const report = await findReport(req.params.id);
  assertCanEdit(report, req.user);

  res.json({ report: present(await editReport({ report, user: req.user, changes })) });
});

// POST /api/reports/:id/cancel — withdraw a pending report. The row is kept.
router.post("/:id/cancel", requireRole("citizen"), async (req, res) => {
  const { details } = parse(z.object({ details: z.string().trim().max(500).optional() }), req.body ?? {});
  const report = await findReport(req.params.id);
  assertCanEdit(report, req.user);

  res.json({ report: present(await cancelReport({ report, user: req.user, details })) });
});

// PATCH /api/reports/:id/status — assigned staff or an admin moves it forward.
router.patch("/:id/status", requireRole("admin", "staff"), async (req, res) => {
  const input = parse(statusSchema, req.body);
  const report = await findReport(req.params.id);
  assertCanUpdate(report, req.user);

  const updated = await changeStatus({
    report,
    user: req.user,
    newStatus: input.status,
    details: input.details,
  });

  res.json({ report: present(updated) });
});

// PATCH /api/reports/:id/assign — admins only, per the proposal.
router.patch("/:id/assign", requireRole("admin"), async (req, res) => {
  const { staff_id } = parse(z.object({ staff_id: z.uuid() }), req.body);
  const report = await findReport(req.params.id);

  res.json({ report: present(await assignStaff({ report, user: req.user, staffId: staff_id })) });
});

// POST /api/reports/:id/remarks — a note on the report without changing status.
router.post("/:id/remarks", requireRole("admin", "staff"), async (req, res) => {
  const { details } = parse(z.object({ details: z.string().trim().min(1).max(500) }), req.body);
  const report = await findReport(req.params.id);
  assertCanUpdate(report, req.user);

  await addRemark({ report, user: req.user, details });
  res.status(201).json({ ok: true });
});

// POST /api/reports/:id/photos — the citizen adds evidence, staff add proof of repair.
router.post("/:id/photos", photoUpload.single("photo"), async (req, res) => {
  if (!req.file) throw badRequest("Attach a photo file in the `photo` field.");

  const report = await findReport(req.params.id);
  const isOwner = report.citizen.id === req.user.id;
  const kind = isOwner ? "initial" : "resolution";

  if (isOwner) {
    if (report.status !== "pending") {
      throw forbidden("Photos can only be added while the report is still pending.");
    }
  } else {
    assertCanUpdate(report, req.user);
  }

  const photo = await savePhoto({
    file: req.file,
    reportId: report.id,
    uploadedBy: req.user.id,
    kind,
  });

  res.status(201).json({ photo: { ...photo, url: photoUrl(photo.storage_path) } });
});

export default router;
