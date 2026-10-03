import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { logActivity } from "../lib/activity.js";
import { badRequest, orThrow, throwIfFailed } from "../lib/errors.js";
import { BARANGAYS, parse } from "../lib/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { OPEN_STATUSES } from "../services/reports.workflow.js";

// Staff specializations and areas (SW-1): which categories each staff member is
// suited to and which barangays they cover, so an administrator assigning a report
// sees the right people first. Admins only.
const router = Router();
router.use(requireAuth, requireRole("admin"));

export type StaffOption = {
  id: string;
  name: string;
  email: string;
  specializations: { id: number; name: string }[];
  areas: string[];
  open_load: number;
  is_specialist: boolean;
  in_area: boolean;
};

const listSchema = z.object({
  category_id: z.coerce.number().int().positive().optional(),
  barangay: z.enum(BARANGAYS).optional(),
});

export const areaSchema = z.object({
  barangays: z
    .array(z.enum(BARANGAYS, "Choose barangays from the list."), { error: "Send the chosen barangays as a list." })
    .refine((names) => new Set(names).size === names.length, "Each barangay can be chosen once."),
});

export const specializationSchema = z.object({
  category_ids: z
    .array(z.number().int().positive(), { error: "Send the chosen categories as a list." })
    .max(50, "Choose 50 categories or fewer.")
    .refine((ids) => new Set(ids).size === ids.length, "Each category can be chosen once."),
});

type StaffInput = Omit<StaffOption, "is_specialist" | "in_area" | "areas"> & { areas?: string[] };

// Staff who match both the report's category and its barangay first, then
// category specialists, then those who cover the barangay, then everyone else
// (SW-1). Within each group, whoever has the least open work, then by name. The
// administrator still chooses; this only orders the list.
export function rankStaff(staff: StaffInput[], categoryId?: number, barangay?: string): StaffOption[] {
  const score = (member: StaffOption) => Number(member.is_specialist) * 2 + Number(member.in_area);
  return staff
    .map((member) => {
      const areas = member.areas ?? [];
      return {
        ...member,
        areas,
        is_specialist: categoryId !== undefined && member.specializations.some((category) => category.id === categoryId),
        in_area: barangay !== undefined && areas.includes(barangay),
      };
    })
    .sort((a, b) => score(b) - score(a) || a.open_load - b.open_load || a.name.localeCompare(b.name));
}

// Open reports per staff member: assigned and not yet resolved or cancelled.
export function countOpenLoad(rows: { assigned_staff_id: string | null }[]) {
  const load = new Map<string, number>();
  for (const row of rows) {
    if (row.assigned_staff_id) load.set(row.assigned_staff_id, (load.get(row.assigned_staff_id) ?? 0) + 1);
  }
  return load;
}

type SpecializationRow = { staff_id: string; category: { id: number; name: string; is_active: boolean } | null };

// A retired category stays on the row (rows are never deleted) but is no longer
// offered as a specialization.
function groupSpecializations(rows: SpecializationRow[]) {
  const byStaff = new Map<string, { id: number; name: string }[]>();
  for (const row of rows) {
    if (!row.category?.is_active) continue;
    const list = byStaff.get(row.staff_id) ?? [];
    list.push({ id: row.category.id, name: row.category.name });
    byStaff.set(row.staff_id, list);
  }
  for (const list of byStaff.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return byStaff;
}

async function activeSpecializations(staffId?: string) {
  let query = db
    .from("staff_specializations")
    .select("staff_id, category:categories ( id, name, is_active )")
    .eq("is_active", true);
  if (staffId) query = query.eq("staff_id", staffId);
  const rows = orThrow(await query, "Staff specializations could not be loaded.");
  return groupSpecializations(rows as unknown as SpecializationRow[]);
}

// Each staff member's active barangays, sorted by name.
async function activeAreas(staffId?: string) {
  let query = db.from("staff_areas").select("staff_id, barangay").eq("is_active", true);
  if (staffId) query = query.eq("staff_id", staffId);
  const rows = orThrow(await query, "Staff areas could not be loaded.") as { staff_id: string; barangay: string }[];
  const byStaff = new Map<string, string[]>();
  for (const row of rows) byStaff.set(row.staff_id, [...(byStaff.get(row.staff_id) ?? []), row.barangay]);
  for (const list of byStaff.values()) list.sort((a, b) => a.localeCompare(b));
  return byStaff;
}

// GET /api/staff?category_id=&barangay= — active staff, ranked for a report in that
// category and barangay.
router.get("/", async (req, res) => {
  const { category_id, barangay } = parse(listSchema, req.query);

  const [staffResult, loadResult, specializations, areas] = await Promise.all([
    db.from("profiles").select("id, name, email").eq("role", "staff").eq("is_active", true),
    db.from("reports").select("assigned_staff_id").in("status", OPEN_STATUSES).not("assigned_staff_id", "is", null),
    activeSpecializations(),
    activeAreas(),
  ]);

  const staff = orThrow(staffResult, "Staff could not be loaded.") as { id: string; name: string; email: string }[];
  const load = countOpenLoad(orThrow(loadResult, "Staff workload could not be loaded."));

  res.json({
    staff: rankStaff(
      staff.map((member) => ({
        ...member,
        specializations: specializations.get(member.id) ?? [],
        areas: areas.get(member.id) ?? [],
        open_load: load.get(member.id) ?? 0,
      })),
      category_id,
      barangay,
    ),
  });
});

async function findStaffMember(id: string) {
  const { data: staff } = await db.from("profiles").select("id, name, role").eq("id", id).maybeSingle();
  if (!staff || staff.role !== "staff") throw badRequest("That user is not a staff member.");
  return staff as { id: string; name: string; role: string };
}

const idSchema = z.object({ id: z.uuid({ error: "That is not a valid user ID." }) });

// GET /api/staff/:id/specializations — one staff member's current categories. Works
// for a deactivated staff member too, who is left out of the list above.
router.get("/:id/specializations", async (req, res) => {
  const staff = await findStaffMember(parse(idSchema, req.params).id);
  const specializations = await activeSpecializations(staff.id);
  res.json({ specializations: specializations.get(staff.id) ?? [] });
});

// PUT /api/staff/:id/specializations { category_ids } — replaces the set. Nothing is
// deleted: a dropped category is switched off and comes back if chosen again.
router.put("/:id/specializations", saveSpecializations);

// GET /api/staff/:id/areas — one staff member's barangays.
router.get("/:id/areas", async (req, res) => {
  const staff = await findStaffMember(parse(idSchema, req.params).id);
  const areas = await activeAreas(staff.id);
  res.json({ areas: areas.get(staff.id) ?? [] });
});

// PUT /api/staff/:id/areas { barangays } — replaces the set. Like specializations,
// nothing is deleted: a dropped barangay is switched off and comes back if chosen.
router.put("/:id/areas", async (req, res) => {
  const { id } = parse(idSchema, req.params);
  const { barangays } = parse(areaSchema, req.body);
  const staff = await findStaffMember(id);

  if (barangays.length > 0) {
    throwIfFailed(
      await db
        .from("staff_areas")
        .upsert(
          barangays.map((barangay) => ({ staff_id: staff.id, barangay, is_active: true })),
          { onConflict: "staff_id,barangay" },
        ),
      "The areas could not be saved.",
    );
  }

  let switchOff = db.from("staff_areas").update({ is_active: false }).eq("staff_id", staff.id).eq("is_active", true);
  // Quoted: names such as "Forbes Park" have spaces. They come from the fixed list.
  if (barangays.length > 0) switchOff = switchOff.not("barangay", "in", `(${barangays.map((name) => `"${name}"`).join(",")})`);
  throwIfFailed(await switchOff, "The areas could not be saved.");

  await logActivity(req, "staff.areas_updated", { entityType: "user", entityId: staff.id, metadata: { barangays } });

  const areas = await activeAreas(staff.id);
  res.json({ areas: areas.get(staff.id) ?? [] });
});

async function saveSpecializations(req: Request, res: Response) {
  const { id } = parse(idSchema, req.params);
  const { category_ids } = parse(specializationSchema, req.body);
  const staff = await findStaffMember(id);

  if (category_ids.length > 0) {
    const categories = orThrow(
      await db.from("categories").select("id").in("id", category_ids).eq("is_active", true),
      "Categories could not be checked.",
    ) as { id: number }[];
    const known = new Set(categories.map((category) => category.id));
    if (category_ids.some((categoryId) => !known.has(categoryId))) {
      throw badRequest("Some fields are invalid. Fix them and try again.", [
        { field: "category_ids", message: "Choose only categories that exist and are active." },
      ]);
    }

    throwIfFailed(
      await db
        .from("staff_specializations")
        .upsert(
          category_ids.map((categoryId) => ({ staff_id: staff.id, category_id: categoryId, is_active: true })),
          { onConflict: "staff_id,category_id" },
        ),
      "The specializations could not be saved.",
    );
  }

  let switchOff = db.from("staff_specializations").update({ is_active: false }).eq("staff_id", staff.id).eq("is_active", true);
  if (category_ids.length > 0) switchOff = switchOff.not("category_id", "in", `(${category_ids.join(",")})`);
  throwIfFailed(await switchOff, "The specializations could not be saved.");

  await logActivity(req, "staff.specializations_updated", {
    entityType: "user",
    entityId: staff.id,
    metadata: { category_ids },
  });

  const specializations = await activeSpecializations(staff.id);
  res.json({ specializations: specializations.get(staff.id) ?? [] });
}

export default router;
