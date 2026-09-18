import { z } from "zod";

// Shared list-query concerns for the two report lists: the public board and
// GET /api/reports. Parsing them in one place means the same search box behaves
// identically wherever the frontend puts it.

export const SORTS = ["newest", "oldest", "status"] as const;
export type Sort = (typeof SORTS)[number];

// Spread into a route's own schema, which adds its own status and category filters.
export const searchFields = {
  q: z.string().trim().min(1).max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(SORTS).default("newest"),
};

// The two lists page differently, so each passes its own limits.
export function pageFields(perPage: number, maxPerPage: number) {
  return {
    page: z.coerce.number().int().min(1).default(1),
    per_page: z.coerce.number().int().min(1).max(maxPerPage).default(perPage),
  };
}

// PostgREST reads .or() as its own comma-separated filter grammar, so a comma,
// parenthesis or wildcard arriving from the search box would change what the query
// means instead of being matched literally. Strip them — a keyword search has no use
// for them — and skip the filter entirely when nothing is left.
export function searchFilter(term: string) {
  const safe = term
    .replace(/[,.()*%\:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return safe ? `title.ilike.%${safe}%,description.ilike.%${safe}%` : null;
}

export function sortColumn(sort: Sort) {
  if (sort === "oldest") return { column: "submitted_at", ascending: true };
  if (sort === "status") return { column: "status", ascending: true };
  return { column: "submitted_at", ascending: false };
}

// `to` arrives as a plain date but the column is a timestamp, so cover the whole day.
export function endOfDay(date: string) {
  return `${date}T23:59:59.999Z`;
}
