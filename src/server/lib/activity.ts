import { db } from "../config/supabase.js";
import type { Request } from "express";
import { throwIfFailed } from "./errors.js";

// System-wide audit trail for the admin log screen. Report-specific history
// lives in report_updates instead. Private proof access requires a saved audit
// row before the URL is returned. Transactional writes log inside their RPC.
type ActivityOptions = { entityType?: string; entityId?: string | number; metadata?: Record<string, unknown>; required?: boolean };
export async function logActivity(req: Request, action: string, { entityType, entityId, metadata, required = false }: ActivityOptions = {}) {
  const { error } = await db.from("activity_logs").insert({
    actor_id: req.user?.id ?? null,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId != null ? String(entityId) : null,
    metadata: metadata ?? {},
    ip_address: req.ip ?? null,
  });

  if (required) throwIfFailed({ error }, "The required audit record could not be saved. Access was not granted.");
  else if (error) console.error(`Could not write activity log "${action}":`, error.message);
}

// Report actions in the system-wide log, so the admin log screen shows who moved,
// assigned, or closed which report next to account and category changes. The
// reference code is copied into the metadata so a log line names the report
// without a join. Labels for every action live in src/web/lib/activity-labels.ts.
export function logReportActivity(
  req: Request,
  action: string,
  report: { id: string; reference_code: string },
  metadata: Record<string, unknown> = {},
) {
  return logActivity(req, action, {
    entityType: "report",
    entityId: report.id,
    metadata: { reference_code: report.reference_code, ...metadata },
  });
}
