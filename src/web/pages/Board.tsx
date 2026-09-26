import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ReportMap } from "../components/ReportMap.js";
import type { Bounds } from "../components/ReportMap.js";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  Pagination,
  PhotoFrame,
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

type PublicStatus = (typeof PUBLIC_STATUSES)[number];

// The board's whole state lives in the URL: a filtered view is then something a
// resident can send to a councillor, and something the Back button can return to.
// Anything hand-typed into the query string is validated back to a default here
// rather than forwarded to the API to be rejected.
function readParams(params: URLSearchParams) {
  const status = params.get("status") ?? "";
  const sort = params.get("sort") ?? "";
  const page = Number(params.get("page"));

  return {
    q: params.get("q") ?? "",
    // `as const` on the empty case, or the union widens to plain string and the
    // STATUS_LABEL lookup below loses its key type.
    status: (PUBLIC_STATUSES as readonly string[]).includes(status) ? (status as PublicStatus) : ("" as const),
    categoryId: params.get("category") ?? "",
    sort: ((SORTS as readonly string[]).includes(sort) ? sort : "newest") as Sort,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    // Off unless asked for. Narrowing by map view is useful, but as a default it let a
    // filter change be swallowed by wherever the map happened to be pointing.
    //
    // `view` and `pane` are different questions and are deliberately separate params:
    // `view=map` asks "narrow the list to the map's current viewport", while `pane`
    // below asks "which of the two does this narrow screen show". One filters data,
    // the other only chooses what is on screen.
    inView: params.get("view") === "map",
    // Which pane a narrow viewport shows. The list leads, because burying the cards
    // under a map was the problem the toggle was added to solve. Ignored from `lg` up,
    // where both panes render side by side.
    pane: params.get("pane") === "map" ? ("map" as const) : ("list" as const),
  };
}

export function BoardPage() {
  const [params, setParams] = useSearchParams();
  const { q, status, categoryId, sort, page, inView, pane } = readParams(params);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);

  // Typing stays local; only the settled term reaches the URL and the API.
  const [search, setSearch] = useState(q);

  // Writes one or more params. Filters replace, so Back leaves the board rather than
  // unwinding every tweak; turning a page pushes, so Back returns to the page before.
  const update = useCallback(
    (changes: Record<string, string | number | null>, { push = false }: { push?: boolean } = {}) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === "") next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace: !push },
      );
    },
    [setParams],
  );

  // Debounced so a keystroke does not become a request. Skipped when the term already
  // matches, so landing on /board?q=… does not immediately rewrite the URL it came from.
  useEffect(() => {
    if (search.trim() === q) return;
    const timer = setTimeout(() => update({ q: search.trim() || null, page: null }), 300);
    return () => clearTimeout(timer);
  }, [search, q, update]);

  // Follow the URL when it changes from anywhere but this input — Back, forward, or
  // Clear filters. Comparing on the trimmed value leaves a half-typed term alone.
  useEffect(() => {
    setSearch((current) => (current.trim() === q ? current : q));
  }, [q]);

  const query = useMemo(
    () => ({ q, status, category_id: categoryId, sort, page, per_page: PER_PAGE }),
    [q, status, categoryId, sort, page],
  );

  const { data, error, loading } = useApi<Paged<"reports", PublicReport>>("/public/reports", query);
  const { data: stats } = useApi<PublicStats>("/public/stats");
  const { data: categoryData } = useApi<{ categories: Category[] }>("/categories");

  const reports = useMemo(() => data?.reports ?? [], [data]);

  // Every refetch hands back a fresh array, so the map is re-aimed on what changed
  // rather than on that new identity: same reports, same key, and the visitor keeps
  // whatever they had panned to.
  const fitKey = useMemo(() => reports.map((report) => report.id).join(","), [reports]);

  // Opt-in: panning narrows the list only while the toggle is on.
  const visible = useMemo(() => {
    if (!inView || !bounds) return reports;
    return reports.filter(
      (report) =>
        report.latitude <= bounds.north &&
        report.latitude >= bounds.south &&
        report.longitude <= bounds.east &&
        report.longitude >= bounds.west,
    );
  }, [reports, bounds, inView]);

  const handleMove = useCallback((next: Bounds) => setBounds(next), []);

  function resetFilters() {
    setSearch("");
    setBounds(null);
    // Which pane is on screen is not a filter, so clearing the filters leaves it
    // alone: a visitor on the map should not be thrown back to the list for asking
    // to see everything.
    const kept = new URLSearchParams();
    if (pane === "map") kept.set("pane", "map");
    setParams(kept, { replace: true });
  }

  const categoryName = (categoryData?.categories ?? []).find(
    (category) => String(category.id) === categoryId,
  )?.name;

  const filtered = q !== "" || status !== "" || categoryId !== "";
  const narrowed = inView && bounds !== null && visible.length !== reports.length;
  const total = data?.total ?? 0;
  const firstLoad = loading && !data;

  // What the visitor is looking at, in their words rather than the query string's.
  const describing = [
    categoryName,
    status ? STATUS_LABEL[status] : null,
    q ? `“${q}”` : null,
    narrowed ? "in this map view" : null,
  ].filter((part): part is string => Boolean(part));

  const shown =
    visible.length === total
      ? `${total} report${total === 1 ? "" : "s"}`
      : `${visible.length} of ${total}`;

  const summary = firstLoad
    ? "Loading the board…"
    : [`Showing ${shown}`, ...describing, loading ? "updating…" : null]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2>Public transparency board</h2>
        <p className="text-muted text-[13px]">
          Every reviewed report, with no reporter details. Updated as work progresses.
        </p>
      </header>

      {/* Counts come from /api/public/stats, which reads the same view as the list, so
          they can never claim more than the board itself can show. They stay the whole
          board on purpose: the headline a transparency board exists to publish should
          not move because a visitor picked a category. What the filter matched is
          reported over the list instead. */}
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
            name="q"
            type="search"
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            placeholder="Pothole, streetlight, barangay hall…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>

        <Field label="Status" htmlFor="status">
          <Select
            id="status"
            value={status}
            onChange={(event) => update({ status: event.target.value || null, page: null })}
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
            onChange={(event) => update({ category: event.target.value || null, page: null })}
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
            onChange={(event) =>
              // The default is left out of the URL, so a shared link carries only what
              // the sender actually chose.
              update({ sort: event.target.value === "newest" ? null : event.target.value, page: null })
            }
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

      {/* Which pane a narrow screen shows. Below lg only: both render together above it.
          Written to the URL like every other control here, so a board someone shares
          from their phone opens on the pane they were looking at. */}
      <div className="flex lg:hidden justify-start" data-testid="mobile-view-toggle">
        <div className="seg w-full sm:w-auto" role="radiogroup" aria-label="Board view selection">
          <label className="seg-opt flex-1 sm:flex-none justify-center font-medium" data-testid="mobile-view-list">
            <input
              type="radio"
              name="board-pane"
              value="list"
              checked={pane === "list"}
              onChange={() => update({ pane: null })}
            />
            <span>List View</span>
          </label>
          <label className="seg-opt flex-1 sm:flex-none justify-center font-medium" data-testid="mobile-view-map">
            <input
              type="radio"
              name="board-pane"
              value="map"
              checked={pane === "map"}
              onChange={() => update({ pane: "map" })}
            />
            <span>Map View</span>
          </label>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Map above the list on mobile (when Map View active), side by side from lg */}
        <div
          data-testid="board-map-container"
          className={`border-2 border-divider h-[360px] lg:h-[560px] ${
            pane === "list" ? "hidden lg:block" : "block"
          }`}
        >
          <ReportMap
            reports={reports}
            fitKey={fitKey}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={handleMove}
            invalidateTrigger={pane}
          />
        </div>

        <div
          data-testid="board-list-container"
          className={`flex flex-col gap-3 lg:max-h-[560px] lg:overflow-y-auto ${
            pane === "map" ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="flex flex-col gap-2 border-b-2 border-divider pb-2">
            <label className="flex cursor-pointer touch-manipulation select-none items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={inView}
                onChange={(event) => update({ view: event.target.checked ? "map" : null })}
                className="size-4 accent-accent"
              />
              Only show reports in this map view
            </label>

            {/* One live region for the list. The single thing a visitor needs told when
                a filter changes is how much it matched. */}
            <p aria-live="polite" className="text-muted font-mono text-[11px]">
              {summary}
            </p>
          </div>

          {!loading && visible.length === 0 && (
            <EmptyState
              title={filtered || narrowed ? "Nothing matches this view" : "No reports on the board yet"}
            >
              {filtered || narrowed ? (
                <div className="flex flex-col items-start gap-3">
                  <p>
                    {narrowed
                      ? "Nothing in this part of the map matches. Pan the map, untick the map-view filter, or clear the filters."
                      : "Try a different word, or clear the filters."}
                  </p>
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

          {/* Results already in hand stay put while the next set loads, dimmed and inert
              rather than yanked away, so the list never collapses and re-expands under a
              visitor who only changed a dropdown. */}
          <div
            aria-busy={loading || undefined}
            className={`flex flex-col gap-3 transition-opacity duration-150 motion-reduce:transition-none ${
              loading && !firstLoad ? "pointer-events-none opacity-50" : ""
            }`}
          >
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
                        <PhotoFrame
                          src={report.photos[0].url}
                          alt={`Photo of the issue reported as ${report.title}`}
                          imageClassName="h-48"
                        />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {data && (
        <Pagination
          page={data.page}
          perPage={data.per_page}
          total={data.total}
          onPage={(next) => update({ page: next === 1 ? null : next }, { push: true })}
        />
      )}

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
      <span className="text-2xl font-extrabold tabular-nums">{value ?? "—"}</span>
    </div>
  );
}
