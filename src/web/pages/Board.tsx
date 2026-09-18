import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ReportMap } from "../components/ReportMap.js";
import type { Bounds } from "../components/ReportMap.js";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  Loading,
  Pagination,
  Select,
  StatusBadge,
  formatDate,
} from "../components/ui.js";
import { useApi } from "../lib/useApi.js";
import { PUBLIC_STATUSES, SORTS, STATUS_LABEL } from "../lib/types.js";
import type { Category, Paged, PublicReport, PublicStats, Sort } from "../lib/types.js";

const PER_PAGE = 50;

const SORT_LABEL: Record<Sort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  status: "By status",
};

export function BoardPage() {
  const [search, setSearch] = useState("");
  // Held apart from `search` so a keystroke does not become a request.
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo(
    () => ({ q, status, category_id: categoryId, sort, page, per_page: PER_PAGE }),
    [q, status, categoryId, sort, page],
  );

  const { data, error, loading } = useApi<Paged<"reports", PublicReport>>("/public/reports", query);
  const { data: stats } = useApi<PublicStats>("/public/stats");
  const { data: categoryData } = useApi<{ categories: Category[] }>("/categories");

  const reports = useMemo(() => data?.reports ?? [], [data]);

  // Panning narrows the list without refetching — the wireframe's stated behaviour.
  // Only what this page already returned can be narrowed this way, which is why the
  // count below says how many are shown rather than implying it is the whole set.
  const visible = useMemo(() => {
    if (!bounds) return reports;
    return reports.filter(
      (report) =>
        report.latitude <= bounds.north &&
        report.latitude >= bounds.south &&
        report.longitude <= bounds.east &&
        report.longitude >= bounds.west,
    );
  }, [reports, bounds]);

  const handleMove = useCallback((next: Bounds) => setBounds(next), []);

  function resetFilters() {
    setSearch("");
    setStatus("");
    setCategoryId("");
    setSort("newest");
    setPage(1);
    setBounds(null);
  }

  const filtered = q !== "" || status !== "" || categoryId !== "";
  const narrowed = bounds !== null && visible.length !== reports.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2>Public transparency board</h2>
        <p className="text-muted text-[13px]">
          Every reviewed report, with no reporter details. Updated as work progresses.
        </p>
      </header>

      {/* Counts come from /api/public/stats, which reads the same view as the list,
          so they can never claim more than the board itself can show. */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-2 border-divider">
        <Stat label="All" value={stats?.total} />
        {PUBLIC_STATUSES.map((key) => (
          <Stat key={key} label={STATUS_LABEL[key]} value={stats?.by_status?.[key]} />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Search" htmlFor="q">
          <Input
            id="q"
            type="search"
            placeholder="Pothole, streetlight, barangay hall..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>

        <Field label="Status" htmlFor="status">
          <Select
            id="status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Any status</option>
            {PUBLIC_STATUSES.map((key) => (
              <option key={key} value={key}>
                {STATUS_LABEL[key]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Category" htmlFor="category">
          <Select
            id="category"
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Any category</option>
            {(categoryData?.categories ?? [])
              .filter((category) => category.is_active)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </Select>
        </Field>

        <Field label="Sort" htmlFor="sort">
          <Select
            id="sort"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as Sort);
              setPage(1);
            }}
          >
            {SORTS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && <Alert title="Could not load the board">{error.message}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Map above the list on mobile, side by side from lg — wireframe 1d. */}
        <div className="h-[320px] lg:h-[560px] border-2 border-divider">
          <ReportMap
            reports={reports}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={handleMove}
          />
        </div>

        <div className="flex flex-col gap-3 lg:max-h-[560px] lg:overflow-y-auto">
          <div className="flex items-baseline justify-between gap-2">
            <h6>Reports in view</h6>
            <span className="text-muted font-mono text-[11px]">
              {visible.length} shown{narrowed ? " in this part of the map" : ""}
            </span>
          </div>

          {loading && <Loading label="Loading the board" />}

          {!loading && visible.length === 0 && (
            <EmptyState
              title={filtered || narrowed ? "Nothing matches this view" : "No reports on the board yet"}
            >
              {filtered || narrowed ? (
                <div className="flex flex-col items-start gap-3">
                  <p>Widen the map, clear the filters, or try a different word.</p>
                  <Button type="button" onClick={resetFilters}>
                    Clear filters
                  </Button>
                </div>
              ) : (
                <p>
                  Reports appear here once staff have reviewed them. Nothing has reached that stage
                  yet.
                </p>
              )}
            </EmptyState>
          )}

          {visible.map((report) => {
            const selected = report.id === selectedId;
            return (
              <button
                key={report.id}
                type="button"
                aria-expanded={selected}
                onClick={() => setSelectedId(selected ? null : report.id)}
                className={selected ? "card p-3 text-left flex flex-col gap-1 border-accent" : "card p-3 text-left flex flex-col gap-1"}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-muted">{report.reference_code}</span>
                  <StatusBadge status={report.status} />
                </span>
                <span className="card-title">{report.title}</span>
                <span className="text-muted text-[11px]">
                  {report.category} &middot; {formatDate(report.submitted_at)}
                  {report.photos.length > 0 ? " · photo" : ""}
                </span>

                {selected && (
                  <span className="flex flex-col gap-2 pt-2">
                    <span className="text-[13px]">{report.description}</span>
                    {report.address_text && (
                      <span className="text-muted text-[11px]">{report.address_text}</span>
                    )}
                    {report.photos[0] && (
                      <span className="grayscale block">
                        <img
                          src={report.photos[0].url}
                          alt=""
                          loading="lazy"
                          className="max-h-48 w-full object-cover"
                        />
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {data && <Pagination page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />}

      <p className="text-muted font-mono text-[10px]">
        Map data &copy; OpenStreetMap contributors, rendered with Leaflet. &middot;{" "}
        <Link to="/">Back to start</Link>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="p-3 flex flex-col gap-0.5 border-r border-b border-divider last:border-r-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</span>
      <span className="text-2xl font-extrabold">{value ?? "—"}</span>
    </div>
  );
}
