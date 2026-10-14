// SW-1 routing data for the Makati demo staff. Each demo staff member handles the
// categories, and covers the barangays, of the reports already assigned to them,
// so the assignment dialog has suggestions to rank.
//
// Kept apart from seed.ts on purpose: the demo manifest is fingerprinted, and a
// changed manifest would no longer match a dataset that is already applied.
//
// Safety contract:
// - Same target rule as the demo seed: the exact HTTPS project, or `local`.
// - `plan` only reads. `apply` adds missing rows and re-enables inactive ones.
// - Never deletes, and never touches staff outside demo-makati-staff-*.

import "dotenv/config";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkTarget } from "./seed.js";

export type AssignedReport = { staff_id: string; category_id: number; barangay: string | null };
export type Routing = {
  specializations: { staff_id: string; category_id: number }[];
  areas: { staff_id: string; barangay: string }[];
};

// One row per staff member and category or barangay, in a stable order.
export function deriveRouting(reports: AssignedReport[]): Routing {
  const specializations = new Map<string, { staff_id: string; category_id: number }>();
  const areas = new Map<string, { staff_id: string; barangay: string }>();
  for (const report of reports) {
    specializations.set(`${report.staff_id}|${report.category_id}`, { staff_id: report.staff_id, category_id: report.category_id });
    if (report.barangay) areas.set(`${report.staff_id}|${report.barangay}`, { staff_id: report.staff_id, barangay: report.barangay });
  }
  const sorted = <T>(rows: Map<string, T>) => [...rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row);
  return { specializations: sorted(specializations), areas: sorted(areas) };
}

const assignedSchema = z.array(z.object({ assigned_staff_id: z.uuid(), category_id: z.number().int(), barangay: z.string().nullable() }));
const existingSchema = z.array(z.object({ staff_id: z.uuid(), is_active: z.boolean() }).catchall(z.unknown()));

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { target: { type: "string" } } });
  const command = z.enum(["plan", "apply"]).parse(positionals[0]);
  const url = z.url().parse(process.env.SUPABASE_URL);
  const key = z.string().min(1).parse(process.env.SUPABASE_SECRET_KEY);
  checkTarget(url, values.target);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const staff = await db.from("profiles").select("id").eq("role", "staff").like("email", "demo-makati-staff-%");
  if (staff.error) throw new Error(staff.error.message);
  const staffIds = (staff.data ?? []).map((row) => row.id as string);
  if (staffIds.length === 0) throw new Error("No demo-makati-staff-* accounts. Apply the demo seed first.");

  const assigned = await db.from("reports").select("assigned_staff_id, category_id, barangay").in("assigned_staff_id", staffIds);
  if (assigned.error) throw new Error(assigned.error.message);
  const routing = deriveRouting(assignedSchema.parse(assigned.data).map((row) => ({ ...row, staff_id: row.assigned_staff_id })));

  const ready = async () => {
    const [specializations, areas] = await Promise.all([
      db.from("staff_specializations").select("staff_id, category_id, is_active").in("staff_id", staffIds),
      db.from("staff_areas").select("staff_id, barangay, is_active").in("staff_id", staffIds),
    ]);
    if (specializations.error) throw new Error(specializations.error.message);
    if (areas.error) throw new Error(areas.error.message);
    const active = (rows: unknown, field: string) =>
      new Set(existingSchema.parse(rows).filter((row) => row.is_active).map((row) => `${row.staff_id}|${String(row[field])}`));
    const activeSpecializations = active(specializations.data, "category_id");
    const activeAreas = active(areas.data, "barangay");
    return {
      specializations: routing.specializations.filter((row) => !activeSpecializations.has(`${row.staff_id}|${row.category_id}`)),
      areas: routing.areas.filter((row) => !activeAreas.has(`${row.staff_id}|${row.barangay}`)),
    };
  };

  const missing = await ready();
  console.log(JSON.stringify({
    target: values.target,
    staff: staffIds.length,
    specializations: routing.specializations.length,
    areas: routing.areas.length,
    missingSpecializations: missing.specializations.length,
    missingAreas: missing.areas.length,
  }, null, 2));
  if (command === "plan") return;

  if (missing.specializations.length > 0) {
    const result = await db.from("staff_specializations")
      .upsert(missing.specializations.map((row) => ({ ...row, is_active: true })), { onConflict: "staff_id,category_id" });
    if (result.error) throw new Error(result.error.message);
  }
  if (missing.areas.length > 0) {
    const result = await db.from("staff_areas")
      .upsert(missing.areas.map((row) => ({ ...row, is_active: true })), { onConflict: "staff_id,barangay" });
    if (result.error) throw new Error(result.error.message);
  }
  const after = await ready();
  if (after.specializations.length > 0 || after.areas.length > 0) throw new Error("Some routing rows are still missing after apply.");
  console.log(JSON.stringify({ applied: true, specializations: missing.specializations.length, areas: missing.areas.length }, null, 2));
}

if (import.meta.main) main().catch((error: unknown) => {
  console.error(`Demo routing failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
