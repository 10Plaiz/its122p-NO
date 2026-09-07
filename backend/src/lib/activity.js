import { db } from "../config/supabase.js";

// System-wide audit trail for the admin log screen. Report-specific history
// lives in report_updates instead. Logging must never break the request that
// triggered it, so failures are reported to the console and swallowed.
export async function logActivity(req, action, { entityType, entityId, metadata } = {}) {
  const { error } = await db.from("activity_logs").insert({
    actor_id: req.user?.id ?? null,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId != null ? String(entityId) : null,
    metadata: metadata ?? {},
    ip_address: req.ip ?? null,
  });

  if (error) console.error(`Could not write activity log "${action}":`, error.message);
}
