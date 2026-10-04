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

// Exports return every matching row instead of one page, up to this many. Past
// that a file stops being something a person opens and reads, and the response
// says it was cut short rather than pretending the file is complete.
export const EXPORT_LIMIT = 5000;

// Supabase's Data API answers one request with at most 1,000 rows by default
// (`max_rows`), so an export reads its rows in chunks no larger than that.
export const EXPORT_CHUNK = 1000;

// The file itself is built in the browser from the columns on screen; the server
// only needs the format to record what was exported.
export const EXPORT_FORMATS = ["csv", "pdf"] as const;

// The inclusive row ranges that cover `total` rows, capped at `limit`, in chunks
// of `chunk`. Each pair is what .range(from, to) takes.
export function exportRanges(total: number, limit = EXPORT_LIMIT, chunk = EXPORT_CHUNK): [number, number][] {
  const end = Math.min(Math.max(0, total), limit);
  const ranges: [number, number][] = [];
  for (let from = 0; from < end; from += chunk) ranges.push([from, Math.min(from + chunk, end) - 1]);
  return ranges;
}
