import { z } from "zod";
import { ROLES } from "../types/auth.js";
import { endOfDay } from "./query.js";

// Filters for the activity log (B9), shared by GET /api/admin/logs and
// GET /api/exports/logs, so an exported file holds exactly what the screen lists
// across every page, not just the page loaded in the browser.
export const logFilterFields = {
  // An action code such as "report.assigned". The screen offers them from its label
  // list; the pattern only keeps the value a plain code.
  action: z
    .string()
    .trim()
    .regex(/^[a-z_]+\.[a-z_]+$/, "Choose an action from the list.")
    .optional(),
  role: z.enum(ROLES).optional(),
  // Part of a report reference, e.g. "KMT-2026-0003". Letters, digits and hyphens.
  reference: z
    .string()
    .trim()
    .max(20, "Keep the reference under 20 characters.")
    .regex(/^[A-Za-z0-9-]*$/, "A reference has only letters, digits, and hyphens.")
    .optional()
    .transform((value) => value || undefined),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
};

export type LogFilters = {
  action?: string;
  role?: (typeof ROLES)[number];
  reference?: string;
  from?: string;
  to?: string;
};

// The select for log rows. Filtering on the actor's role needs an inner join, or
// PostgREST would keep every row and only blank the actor; without that filter the
// join stays optional so entries with no actor (system actions) are still listed.
export function logSelect(filters: Pick<LogFilters, "role">) {
  const join = filters.role ? "profiles!inner" : "profiles";
  return `id, action, entity_type, entity_id, metadata, created_at, actor:${join} ( id, name, role )`;
}

type Filterable<Q> = {
  eq(column: string, value: unknown): Q;
  ilike(column: string, pattern: string): Q;
  gte(column: string, value: string): Q;
  lte(column: string, value: string): Q;
};

export function applyLogFilters<Q extends Filterable<Q>>(query: Q, filters: LogFilters): Q {
  let next = query;
  if (filters.action) next = next.eq("action", filters.action);
  if (filters.role) next = next.eq("actor.role", filters.role);
  // Report actions store the reference in metadata (logReportActivity).
  if (filters.reference) next = next.ilike("metadata->>reference_code", `%${filters.reference}%`);
  if (filters.from) next = next.gte("created_at", filters.from);
  if (filters.to) next = next.lte("created_at", endOfDay(filters.to));
  return next;
}
