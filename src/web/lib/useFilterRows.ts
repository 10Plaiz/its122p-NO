import { useCallback, useEffect, useState } from "react";
import { ApiError, api, toQuery } from "./api.js";
import type { Query } from "./api.js";
import type { FilterRow, FilterValues } from "./filter-counts.js";
import type { ActivityLog, Paged, PublicReport, Report } from "./types.js";

type CountState =
  | { kind: "loading"; requestKey: string }
  | { kind: "ready"; requestKey: string; rows: FilterRow[] }
  | { kind: "failed"; requestKey: string; error: ApiError };

export function reportFilterValues(report: Report | PublicReport): FilterValues {
  return {
    status: report.status,
    category: String("category_id" in report ? report.category_id : report.category?.id ?? ""),
    barangay: report.barangay ?? "",
  };
}

export function logFilterValues(log: ActivityLog): FilterValues {
  return { action: log.action, role: log.actor?.role ?? "" };
}

// Count the whole permitted result set, never just the table's current page.
// Pages load sequentially; only the small filter values stay in memory.
export function useFilterRows<K extends string, T extends { id: string | number }>({
  path,
  collection,
  query,
  perPage,
  valuesOf,
}: {
  path: string;
  collection: K;
  query: Query;
  perPage: number;
  valuesOf: (item: T) => FilterValues;
}) {
  const [revision, setRevision] = useState(0);
  const queryKey = toQuery(query);
  const requestKey = `${path}${queryKey}:${collection}:${perPage}:${revision}`;
  const [state, setState] = useState<CountState>({ kind: "loading", requestKey: "" });

  useEffect(() => {
    const controller = new AbortController();
    const countQuery = Object.fromEntries(new URLSearchParams(queryKey));
    setState({ kind: "loading", requestKey });

    async function load() {
      const rows: FilterRow[] = [];
      const seen = new Set<string | number>();
      let total: number | null = null;
      let page = 1;
      do {
        const result = await api.get<Paged<K, T>>(path, { ...countQuery, page, per_page: perPage }, controller.signal);
        const items = result[collection];
        total ??= result.total;
        const expected = Math.min(perPage, Math.max(0, total - (page - 1) * perPage));
        if (result.total !== total || result.per_page !== perPage || items.length !== expected) {
          throw new ApiError(0, "The results changed while counting. Try again.");
        }
        for (const item of items) {
          if (seen.has(item.id)) throw new ApiError(0, "The results changed while counting. Try again.");
          seen.add(item.id);
          rows.push({ id: item.id, values: valuesOf(item) });
        }
        page++;
      } while (rows.length < total);
      if (!controller.signal.aborted) setState({ kind: "ready", requestKey, rows });
    }

    // Typing does not launch a full count request for every keystroke.
    const timer = setTimeout(() => {
      void load().catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: "failed", requestKey, error: error instanceof ApiError ? error : new ApiError(0, "Filter counts could not be loaded.") });
      });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, collection, queryKey, perPage, valuesOf, requestKey]);

  const current = state.requestKey === requestKey;
  const rows = current && state.kind === "ready" ? state.rows : null;
  const error = current && state.kind === "failed" ? state.error : null;
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { rows, error, loading: rows === null && error === null, reload };
}
