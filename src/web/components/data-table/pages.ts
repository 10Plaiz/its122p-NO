// The arithmetic behind NumberedPagination, kept free of React so it can be tested
// on its own.

export type PageItem = number | "gap";

/** The last page for a result set. Never below 1, so an empty table still has a page 1. */
export function lastPage(total: number, perPage: number) {
  return Math.max(1, Math.ceil(total / Math.max(1, perPage)));
}

// Google-style: the first and last page always, the current page with one
// neighbour each side, and a gap where pages are skipped. Short runs are shown in
// full, and the ends stretch to five pages so the row does not jump in width as
// the current page moves away from either end.
//
//   page 1 of 10  → 1 2 3 4 5 … 10
//   page 6 of 10  → 1 … 5 6 7 … 10
//   page 10 of 10 → 1 … 6 7 8 9 10
export function pageItems(page: number, last: number): PageItem[] {
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1);

  const current = Math.min(Math.max(1, page), last);
  if (current <= 4) return [1, 2, 3, 4, 5, "gap", last];
  if (current >= last - 3) return [1, "gap", last - 4, last - 3, last - 2, last - 1, last];
  return [1, "gap", current - 1, current, current + 1, "gap", last];
}

/** Reads the jump-to-page box. Returns the page, or null when it is not a page that exists. */
export function parsePage(text: string, last: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const page = Number(trimmed);
  return page >= 1 && page <= last ? page : null;
}

/** "21–40 of 120": the rows on this page and the total. */
export function rangeSummary(page: number, perPage: number, total: number) {
  if (total <= 0) return "0 of 0";
  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);
  const format = (value: number) => value.toLocaleString("en-PH");
  return `${format(first)}–${format(last)} of ${format(total)}`;
}
