/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { AdvancedMarker, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import type { MapMouseEvent } from "@vis.gl/react-google-maps";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DETAIL_ZOOM,
  MAKATI_ERROR,
  MAP_RESTRICTION,
  MIN_ZOOM,
  SEARCH_BOUNDS,
  googleMapId,
  isInsideMakati,
} from "../lib/maps.js";
import { MakatiOutline, MapFrame } from "./MapFrame.js";
import { Button } from "./ui.js";
import { PIN_OUTSIDE_ERROR, pinError } from "../lib/report-rules.js";

// Pin drop for the report wizard and the citizen's edit form. The caller owns the
// coordinates; this reports where the pin was put by click, drag, place search, or
// the keyboard-accessible map-center button. Only points inside Makati are reported:
// anything else leaves the pin where it was and says why, beside the map.

type Point = { lat: number; lng: number };

const keyOf = (point: Point) => `${point.lat},${point.lng}`;

export function MapPicker({
  value,
  onChange,
}: {
  value: Point | null;
  onChange: (point: Point) => void;
}) {
  // Without the map its refusal cannot show, but a device location outside Makati
  // still needs a reason beside the disabled Continue or Save.
  const outside = pinError(value);
  return (
    <MapFrame
      unavailable={
        <>
          Use my location can still place the pin.
          {outside && (
            <p
              role="alert"
              data-testid="map-picker-refusal"
              className="!m-0 mt-2 border border-accent bg-surface p-2 text-[13px] leading-snug text-text"
            >
              {outside}
            </p>
          )}
        </>
      }
    >
      <Picker value={value} onChange={onChange} />
    </MapFrame>
  );
}

function Picker({ value, onChange }: { value: Point | null; onChange: (point: Point) => void }) {
  const map = useMap();
  const marker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  // The last point this picker handed its caller. A value equal to it came from the
  // visitor's own tap, so the view is already on it; anything else came from outside
  // (the device's location, a saved report) and the map moves to show it.
  const emitted = useRef<string | null>(null);

  // The caller can set a point the picker never would, such as a device location in
  // Pasay. It is not drawn as a pin, and the message says why.
  const valueOutside = value !== null && !isInsideMakati(value.lat, value.lng);
  const message = valueOutside ? PIN_OUTSIDE_ERROR : refusal;

  function pick(point: Point, what: "spot" | "place"): boolean {
    if (!isInsideMakati(point.lat, point.lng)) {
      setRefusal(`That ${what} is outside Makati. ${MAKATI_ERROR}`);
      return false;
    }
    setRefusal(null);
    emitted.current = keyOf(point);
    onChange(point);
    return true;
  }

  useEffect(() => {
    if (!map || !value || valueOutside) return;
    const key = keyOf(value);
    if (key === emitted.current) return;
    emitted.current = key;
    map.panTo(value);
    if ((map.getZoom() ?? 0) < DETAIL_ZOOM) map.setZoom(DETAIL_ZOOM);
  }, [map, value, valueOutside]);

  return (
    <div className="flex h-full flex-col">
      <PlaceSearch
        onPick={(point) => {
          if (!pick(point, "place") || !map) return;
          map.panTo(point);
          if ((map.getZoom() ?? 0) < DETAIL_ZOOM) map.setZoom(DETAIL_ZOOM);
        }}
      />

      <div className="relative flex-1 min-h-0">
        <Map
          mapId={googleMapId()}
          defaultCenter={value && !valueOutside ? value : DEFAULT_CENTER}
          defaultZoom={value && !valueOutside ? DETAIL_ZOOM : DEFAULT_ZOOM}
          minZoom={MIN_ZOOM}
          restriction={MAP_RESTRICTION}
          // A tap on a shop's icon should drop the pin there, not open Google's card.
          clickableIcons={false}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          style={{ position: "absolute", inset: 0 }}
          onClick={(event: MapMouseEvent) => {
            const point = event.detail.latLng;
            if (point) pick(point, "spot");
          }}
        >
          <MakatiOutline />
          {value && !valueOutside && (
            <AdvancedMarker
              ref={marker}
              position={value}
              draggable
              title="Report location. Drag to adjust."
              // Centred on the point, like the crosshair it is.
              anchorLeft="-50%"
              anchorTop="-50%"
              onDragEnd={(event) => {
                const point = event.latLng;
                if (!point) return;
                // Refused: Google has already moved the marker, so put it back.
                if (!pick({ lat: point.lat(), lng: point.lng() }, "spot") && marker.current) {
                  marker.current.position = value;
                }
              }}
            >
              {/* A crosshair rather than the status square used on the board: this pin
                  is being placed, not reported on, and should not read as a report. */}
              <span
                aria-hidden="true"
                style={{
                  display: "block",
                  width: 22,
                  height: 22,
                  border: "3px solid var(--color-accent)",
                  background: "color-mix(in srgb, var(--color-accent) 25%, transparent)",
                  boxShadow: "var(--shadow-md)",
                }}
              />
            </AdvancedMarker>
          )}
        </Map>

        {/* Top left is the one corner Google leaves empty with these controls off; its
            logo, which must stay visible, is bottom left. */}
        <div className="pointer-events-none absolute top-2 left-2 right-2 z-[1] flex flex-col items-start gap-2">
          <Button
            type="button"
            className="pointer-events-auto bg-surface shadow-md"
            disabled={!map}
            onClick={() => {
              const center = map?.getCenter();
              if (center) pick({ lat: center.lat(), lng: center.lng() }, "spot");
            }}
          >
            Place pin at map center
          </Button>
          {message && (
            <p
              role="alert"
              data-testid="map-picker-refusal"
              className="pointer-events-auto !m-0 max-w-xs border border-accent bg-surface p-2 text-[13px] leading-snug shadow-md"
            >
              {message}
            </p>
          )}
        </div>
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
          Place search is unavailable. Tap the map to place the pin.
        </p>
      )}
    </div>
  );
}

export type { Point };
