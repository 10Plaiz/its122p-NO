/// <reference types="google.maps" />
import { useEffect, useRef } from "react";
import { AdvancedMarker, Map, useMap } from "@vis.gl/react-google-maps";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DETAIL_ZOOM,
  MAP_RESTRICTION,
  MIN_ZOOM,
  googleMapId,
} from "../lib/maps.js";
import type { PublicReport } from "../lib/types.js";
import { MakatiOutline, MapFrame } from "./MapFrame.js";
import { StatusPin } from "./StatusPin.js";

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
//
// A map mounted inside a hidden pane measures 0x0, and fitting to that yields a
// centre and zoom aimed at nothing, so the fit waits until the map has a size. The
// ResizeObserver is what tells it to try again when the pane is shown; `sizeKey`
// (the board's pane) retries as well, for browsers that report the change late.
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
    if (!map) return;
    const container = map.getDiv();
    // A map created after Google rejects the key can lack its DOM container.
    if (!container) return;

    function tryFit() {
      if (!map || fitted.current === fitKey) return;
      // Nowhere to aim it yet.
      if (container.clientWidth === 0 || container.clientHeight === 0) return;

      const points = latest.current.filter(
        (report) => report.latitude != null && report.longitude != null,
      );
      if (points.length === 0) return;

      if (points.length === 1) {
        map.setCenter({ lat: points[0].latitude, lng: points[0].longitude });
        map.setZoom(DETAIL_ZOOM);
      } else {
        const bounds = new google.maps.LatLngBounds();
        for (const report of points) bounds.extend({ lat: report.latitude, lng: report.longitude });
        map.fitBounds(bounds, 32);
        // fitBounds has no maxZoom; two reports on one corner would otherwise zoom
        // in to the kerb.
        google.maps.event.addListenerOnce(map, "idle", () => {
          if ((map.getZoom() ?? 0) > DETAIL_ZOOM) map.setZoom(DETAIL_ZOOM);
        });
      }
      fitted.current = fitKey;
    }

    tryFit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(tryFit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [map, fitKey, sizeKey]);

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
  /** Changes when the map's pane may have been shown or hidden. */
  invalidateTrigger?: unknown;
}) {
  return (
    <MapFrame>
      <Map
        mapId={googleMapId()}
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={DEFAULT_ZOOM}
        minZoom={MIN_ZOOM}
        restriction={MAP_RESTRICTION}
        clickableIcons={false}
        mapTypeControl={false}
        streetViewControl={false}
        className="h-full w-full"
        // Google needs a real height; the parent supplies it.
        style={{ minHeight: "320px" }}
      >
        <FitToReports reports={reports} fitKey={fitKey} sizeKey={invalidateTrigger} />
        <MakatiOutline />

        {reports
          .filter((report) => report.latitude != null && report.longitude != null)
          .map((report) => {
            const selected = report.id === selectedId;
            const size = selected ? 20 : 14;
            return (
              <AdvancedMarker
                key={report.id}
                position={{ lat: report.latitude, lng: report.longitude }}
                // The marker is a button; its title is what a screen reader reads.
                title={report.title}
                zIndex={selected ? 2 : 1}
                anchorLeft="-50%"
                anchorTop="-50%"
                onClick={() => onSelect(report.id)}
              >
                <StatusPin status={report.status} size={size} />
              </AdvancedMarker>
            );
          })}
      </Map>
    </MapFrame>
  );
}
