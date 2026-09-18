import { useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL, pinFor } from "../lib/leaflet.js";
import type { PublicReport } from "../lib/types.js";

// Read-only map of reports. The board owns the data; this renders pins and reports
// back which ones are inside the current view, so panning narrows the list beside it.

type Bounds = { north: number; south: number; east: number; west: number };

function ViewportWatcher({ onMove }: { onMove: (bounds: Bounds) => void }) {
  const map = useMap();

  useEffect(() => {
    function publish() {
      const bounds = map.getBounds();
      onMove({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    }

    map.on("moveend", publish);
    return () => {
      map.off("moveend", publish);
    };
  }, [map, onMove]);

  return null;
}

// Refits the view when the result set changes, so a filter that returns pins
// elsewhere in the city does not leave the map looking empty.
//
// Keyed on `fitKey` rather than on the reports array: every refetch hands back a new
// array, so depending on the array itself re-aimed the map even when the results came
// back identical, throwing away wherever the visitor had panned. The key is built
// from the report ids, so the map moves when the results actually differ and holds
// still when they do not.
function FitToReports({ reports, fitKey }: { reports: PublicReport[]; fitKey: string }) {
  const map = useMap();
  const latest = useRef(reports);

  // Declared first so the mirror is current before the fit below reads it.
  useEffect(() => {
    latest.current = reports;
  }, [reports]);

  useEffect(() => {
    const points = latest.current
      .filter((report) => report.latitude != null && report.longitude != null)
      .map((report) => [report.latitude, report.longitude] as [number, number]);

    if (points.length === 0) return;
    // Unanimated on purpose: it respects a reduced-motion preference without asking,
    // and `moveend` fires at once rather than a flight later.
    map.fitBounds(points, { padding: [32, 32], maxZoom: 16, animate: false });
  }, [map, fitKey]);

  return null;
}

export function ReportMap({
  reports,
  fitKey,
  selectedId,
  onSelect,
  onMove,
}: {
  reports: PublicReport[];
  /** Changes only when the results genuinely differ; see FitToReports. */
  fitKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove?: (bounds: Bounds) => void;
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
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      <FitToReports reports={reports} fitKey={fitKey} />
      {onMove && <ViewportWatcher onMove={onMove} />}

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

export type { Bounds };
