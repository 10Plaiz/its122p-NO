import { Router } from "express";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { badRequest, notFound, orThrow } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logActivity } from "../lib/activity.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const ROLES = ["admin", "staff", "citizen"];

const createUserSchema = z.object({
  name: z.string().trim().min(2),
  email: z.email(),
  password: z.string().min(8, "Use at least 8 characters."),
  role: z.enum(ROLES),
  contact_number: z.string().trim().min(7).max(20).optional(),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  role: z.enum(ROLES).optional(),
  contact_number: z.string().trim().min(7).max(20).optional(),
  is_active: z.boolean().optional(),
});

// ---------------------------------------------------------------------- users

router.get("/users", async (req, res) => {
  const { role } = parse(z.object({ role: z.enum(ROLES).optional() }), req.query);

  let query = db
    .from("profiles")
    .select("id, name, email, role, contact_number, is_active, created_at")
    .order("created_at", { ascending: false });

  if (role) query = query.eq("role", role);

  res.json({ users: orThrow(await query, "Users could not be loaded.") });
});

// Staff and admin accounts exist only because an admin created them here.
router.post("/users", async (req, res) => {
  const input = parse(createUserSchema, req.body);

  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (error) throw badRequest("That account could not be created.", error.message);

  const user = orThrow(
    await db
      .from("profiles")
      .insert({
        id: data.user.id,
        name: input.name,
        email: input.email,
        role: input.role,
        contact_number: input.contact_number ?? null,
      })
      .select("id, name, email, role, contact_number, is_active")
      .single(),
    "The login was created but the profile could not be saved.",
  );

  await logActivity(req, "user.created", { entityType: "user", entityId: user.id, metadata: { role: user.role } });
  res.status(201).json({ user });
});

router.patch("/users/:id", async (req, res) => {
  const input = parse(updateUserSchema, req.body);

  // An admin who demotes or deactivates themselves would lock everyone out.
  if (req.params.id === req.user.id && (input.role || input.is_active === false)) {
    throw badRequest("You cannot change your own role or deactivate your own account.");
  }

  const { data: user } = await db
    .from("profiles")
    .update(input)
    .eq("id", req.params.id)
    .select("id, name, email, role, contact_number, is_active")
    .single();

  if (!user) throw notFound("That user does not exist.");

  await logActivity(req, "user.updated", { entityType: "user", entityId: user.id, metadata: input });
  res.json({ user });
});

// ------------------------------------------------------------------ analytics

// Aggregated in JavaScript rather than SQL. At the volume this system handles
// that is fast enough, and it keeps the whole calculation visible in one place.
router.get("/analytics", async (_req, res) => {
  const reports = orThrow(
    await db.from("reports").select("status, submitted_at, resolved_at, category:categories ( name )"),
    "Analytics could not be loaded.",
  );

  const byStatus = { pending: 0, under_review: 0, in_progress: 0, resolved: 0 };
  const byCategory = {};
  const resolutionDays = [];

  for (const report of reports) {
    byStatus[report.status] += 1;
    byCategory[report.category.name] = (byCategory[report.category.name] ?? 0) + 1;

    if (report.resolved_at) {
      const elapsed = new Date(report.resolved_at) - new Date(report.submitted_at);
      resolutionDays.push(elapsed / 86_400_000);
    }
  }

  const average = resolutionDays.length
    ? resolutionDays.reduce((sum, days) => sum + days, 0) / resolutionDays.length
    : null;

  res.json({
    total_reports: reports.length,
    by_status: byStatus,
    by_category: byCategory,
    resolved_count: resolutionDays.length,
    average_resolution_days: average === null ? null : Number(average.toFixed(1)),
  });
});

// ----------------------------------------------------------------------- logs

router.get("/logs", async (req, res) => {
  const { page, per_page } = parse(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      per_page: z.coerce.number().int().min(1).max(100).default(50),
    }),
    req.query,
  );

  const result = await db
    .from("activity_logs")
    .select("id, action, entity_type, entity_id, metadata, created_at, actor:profiles ( id, name, role )", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * per_page, page * per_page - 1);

  res.json({
    logs: orThrow(result, "Activity logs could not be loaded."),
    page,
    per_page,
    total: result.count ?? 0,
  });
});

export default router;
