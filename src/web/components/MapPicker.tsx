/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DETAIL_ZOOM,
  MAP_RESTRICTION,
  MIN_ZOOM,
  SEARCH_BOUNDS,
  googleMapId,
} from "../lib/maps.js";
import { MakatiOutline, MapFrame } from "./MapFrame.js";
import { Button } from "./ui.js";
import { pinError, sameReportPoint } from "../lib/report-rules.js";

type Point = { lat: number; lng: number };

type PickerProps = {
  value: Point | null;
  centerRequest?: Point | null;
  onChange: (point: Point | null) => void;
};

// Only confirmed points leave the picker. Panning, search and GPS prepare a
// candidate and invalidate the previous confirmation in both caller forms.
export function MapPicker({ value, centerRequest, onChange }: PickerProps) {
  const fallbackPoint = centerRequest ?? value;
  const outside = pinError(fallbackPoint);
  return (
    <MapFrame unavailable={
      <div className="flex flex-col gap-2">
        <p className="!m-0">Use my location, then confirm the coordinates below.</p>
        {outside ? <p role="alert">{outside}</p> : fallbackPoint && (
          <>
            <span className="font-mono">{fallbackPoint.lat.toFixed(5)}, {fallbackPoint.lng.toFixed(5)}</span>
            <Button type="button" disabled={value !== null} onClick={() => onChange(fallbackPoint)}>
              {value ? "Location confirmed" : "Confirm location"}
            </Button>
          </>
        )}
      </div>
    }>
      <Picker value={value} centerRequest={centerRequest} onChange={onChange} />
    </MapFrame>
  );
}

function Picker({ value, centerRequest, onChange }: PickerProps) {
  const map = useMap();
  const [center, setCenter] = useState<Point>(value ?? DEFAULT_CENTER);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [moving, setMoving] = useState(true);
  const outside = pinError(center);

  useEffect(() => {
    const target = centerRequest ?? value;
    if (!map || !target) return;
    const error = pinError(target);
    setRefusal(error ?? null);
    if (error) return;
    const current = map.getCenter();
    if (!current || !sameReportPoint(target, { lat: current.lat(), lng: current.lng() })) {
      setMoving(true);
      map.panTo(target);
    }
    if ((map.getZoom() ?? 0) < DETAIL_ZOOM) map.setZoom(DETAIL_ZOOM);
  }, [map, centerRequest, value]);

  return (
    <div className="flex h-full flex-col">
      <PlaceSearch onPick={(point) => {
        onChange(null);
        const error = pinError(point);
        setRefusal(error ?? null);
        if (error || !map) return;
        const current = map.getCenter();
        if (!current || !sameReportPoint(point, { lat: current.lat(), lng: current.lng() })) {
          setMoving(true);
          map.panTo(point);
        }
        if ((map.getZoom() ?? 0) < DETAIL_ZOOM) map.setZoom(DETAIL_ZOOM);
      }} />
      <div className="relative flex-1 min-h-0">
        <Map
          mapId={googleMapId()}
          defaultCenter={value && !pinError(value) ? value : DEFAULT_CENTER}
          defaultZoom={value ? DETAIL_ZOOM : DEFAULT_ZOOM}
          minZoom={MIN_ZOOM}
          restriction={MAP_RESTRICTION}
          clickableIcons={false}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          style={{ position: "absolute", inset: 0 }}
          onCenterChanged={(event) => {
            const point = event.detail.center;
            setMoving(true);
            setRefusal(null);
            setCenter(point);
            if (value && !sameReportPoint(value, point)) onChange(null);
          }}
          onIdle={() => setMoving(false)}
        >
          <MakatiOutline />
        </Map>
        <span aria-hidden="true" data-testid="map-center-pin"
          className="pointer-events-none absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2"
          style={{ width: 22, height: 22, border: "3px solid var(--color-accent)",
            background: "color-mix(in srgb, var(--color-accent) 25%, transparent)", boxShadow: "var(--shadow-md)" }} />
        {(outside || refusal) && <p role="alert" data-testid="map-picker-refusal"
          className="absolute top-2 left-2 right-2 z-[1] !m-0 border border-accent bg-surface p-2 text-[13px]">
          {outside ?? refusal}
        </p>}
      </div>
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-t-2 border-divider bg-surface p-2">
        <Button type="button" disabled={!map || moving || Boolean(outside || refusal) || value !== null}
          onClick={() => { setRefusal(null); onChange(center); }}>
          {value ? "Location confirmed" : "Confirm location"}
        </Button>
        <span role="status" className="text-[12px] text-muted">
          {value ? "Move the map to change the location." : "Pan the map under the center pin, then confirm."}
        </span>
      </div>
    </div>
  );
}

// Google's place search, limited to Makati's box. A result still goes through the
// polygon check in `onPick`'s caller, since the box takes in slivers of Taguig and
// Manila. Built on PlaceAutocompleteElement because the older Autocomplete widget is
// closed to Google Cloud projects created after March 2025.
function PlaceSearch({ onPick }: { onPick: (point: Point) => void }) {
  const places = useMapsLibrary("places");
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // The element is built once; this keeps its listener calling the current handler.
  const latest = useRef(onPick);
  useEffect(() => {
    latest.current = onPick;
  });

  useEffect(() => {
    const container = host.current;
    if (!places || !container) return;

    const element = new places.PlaceAutocompleteElement({
      locationRestriction: SEARCH_BOUNDS,
      includedRegionCodes: ["ph"],
      placeholder: "Street, building, or landmark…",
      description: "Suggestions are limited to Makati.",
    });
    element.setAttribute("aria-label", "Search for a place in Makati");
    element.style.width = "100%";

    async function onSelect(event: google.maps.places.PlacePredictionSelectEvent) {
      try {
        const place = event.placePrediction.toPlace();
        await place.fetchFields({ fields: ["location"] });
        const location = place.location;
        if (location) latest.current({ lat: location.lat(), lng: location.lng() });
      } catch {
        setFailed(true);
      }
    }
    // Usually the key lacks the Places API (New); the map still works without it.
    function onError() {
      setFailed(true);
    }

    element.addEventListener("gmp-select", onSelect);
    element.addEventListener("gmp-error", onError);
    container.replaceChildren(element);

    return () => {
      element.removeEventListener("gmp-select", onSelect);
      element.removeEventListener("gmp-error", onError);
      element.remove();
    };
  }, [places]);

  return (
    <div className="shrink-0 flex flex-col gap-1 border-b-2 border-divider bg-surface p-2">
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-muted">
        Search Makati
      </span>
      <div ref={host} data-testid="map-picker-search" className={failed ? "hidden" : "min-h-10"} />
      {failed && (
        <p role="status" className="!m-0 text-muted text-[12px]">
          Place search is unavailable. Pan the map, then choose Confirm location.
        </p>
      )}
    </div>
  );
}

export type { Point };
