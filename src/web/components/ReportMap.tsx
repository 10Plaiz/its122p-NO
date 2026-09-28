import { useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL, pinFor } from "../lib/leaflet.js";
import type { PublicReport } from "../lib/types.js";

// Read-only map of reports. The board owns the data; this renders its pins and
// reports back which one a visitor clicked.

// Refits the view when the result set changes, so a filter that returns pins
// elsewhere in the city does not leave the map looking empty.
//
// Keyed on `fitKey` rather than on the reports array: every refetch hands back a new
// array, so depending on the array itself re-aimed the map even when the results came
// back identical, throwing away wherever the visitor had panned. The key is built
// from the report ids, so the map moves when the results actually differ and holds
// still when they do not.
// `sizeKey` changes whenever the container may have been shown or hidden. A map that
// is mounted inside a hidden pane measures 0x0, and fitting to that yields a centre and
// zoom aimed at nothing, so the fit is deferred until the map has a size, and this is
// what tells it to try again.
function FitToReports({
  reports,
  fitKey,
  sizeKey,
}: {
  reports: PublicReport[];
  fitKey: string;
  sizeKey?: unknown;
}) {
  const map = useMap();
  const latest = useRef(reports);
  // Which result set the current view was actually aimed at. A fit skipped for want of
  // a size leaves this behind `fitKey`, so the next run still owes one.
  const fitted = useRef<string | null>(null);

  // Declared first so the mirror is current before the fit below reads it.
  useEffect(() => {
    latest.current = reports;
  }, [reports]);

  useEffect(() => {
    function tryFit() {
      // Nothing to aim, or nowhere to aim it yet.
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) return;
      if (fitted.current === fitKey) return;

      const points = latest.current
        .filter((report) => report.latitude != null && report.longitude != null)
        .map((report) => [report.latitude, report.longitude] as [number, number]);

      if (points.length === 0) return;
      // Unanimated on purpose: it respects a reduced-motion preference without asking.
      map.fitBounds(points, { padding: [32, 32], maxZoom: 16, animate: false });
      fitted.current = fitKey;
    }

    tryFit();
    map.on("resize", tryFit);
    return () => {
      map.off("resize", tryFit);
    };
  }, [map, fitKey, sizeKey]);

  return null;
}

function AutoInvalidate({ trigger }: { trigger?: unknown }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map, trigger]);

  useEffect(() => {
    const container = map.getContainer();
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);

  return null;
}

export function ReportMap({
  reports,
  fitKey,
  selectedId,
  onSelect,
  invalidateTrigger,
}: {
  reports: PublicReport[];
  /** Changes only when the results genuinely differ; see FitToReports. */
  fitKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  invalidateTrigger?: unknown;
}) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
      // Leaflet needs a real height; the parent supplies it.
      style={{ minHeight: "320px" }}
    >
      {/* Order matters: AutoInvalidate must remeasure before FitToReports computes a
          zoom, or the fit is still working from the collapsed size. */}
      <AutoInvalidate trigger={invalidateTrigger} />
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      <FitToReports reports={reports} fitKey={fitKey} sizeKey={invalidateTrigger} />

      {reports
        .filter((report) => report.latitude != null && report.longitude != null)
        .map((report) => (
          <Marker
            key={report.id}
            position={[report.latitude, report.longitude]}
            icon={pinFor(report.status, report.id === selectedId)}
            eventHandlers={{ click: () => onSelect(report.id) }}
            title={report.title}
          />
        ))}
    </MapContainer>
  );
}
