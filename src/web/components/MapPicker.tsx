import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL } from "../lib/leaflet.js";
import { Button } from "./ui.js";

// Pin drop for the report wizard. The caller owns the coordinates; this reports
// where the pin was put by click, drag, or the keyboard-accessible map-center button.

// A crosshair rather than the status square used on the board: this pin is being
// placed, not reported on, and it should not read as an existing report.
const PICKER_ICON = L.divIcon({
  className: "",
  html: `<span style="
    display:block;
    width:22px;
    height:22px;
    border:3px solid var(--color-accent);
    background:color-mix(in srgb, var(--color-accent) 25%, transparent);
    box-shadow:var(--shadow-md);
  "></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

type Point = { lat: number; lng: number };

function ClickToPlace({ onPick }: { onPick: (point: Point) => void }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

// Recentres when the value changes from outside (using the device's location, for
// instance) without fighting the user while they pan.
function Recentre({ value }: { value: Point | null }) {
  const map = useMap();
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    const key = `${value.lat},${value.lng}`;
    if (key === last) return;
    setLast(key);
    map.setView([value.lat, value.lng], Math.max(map.getZoom(), 16));
  }, [value, map, last]);

  return null;
}

export function MapPicker({
  value,
  onChange,
}: {
  value: Point | null;
  onChange: (point: Point) => void;
}) {
  const [map, setMap] = useState<L.Map | null>(null);

  return (
    <div className="relative h-full">
      <MapContainer
        ref={setMap}
        center={value ? [value.lat, value.lng] : DEFAULT_CENTER}
        zoom={value ? 16 : DEFAULT_ZOOM}
        scrollWheelZoom
        className="h-full w-full"
        style={{ minHeight: "300px" }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <ClickToPlace onPick={onChange} />
        <Recentre value={value} />

        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={PICKER_ICON}
            draggable
            eventHandlers={{
              dragend(event) {
                const { lat, lng } = event.target.getLatLng();
                onChange({ lat, lng });
              },
            }}
          />
        )}
      </MapContainer>
      <Button
        type="button"
        className="absolute bottom-8 left-2 z-[1000] bg-surface shadow-md"
        disabled={!map}
        onClick={() => {
          if (!map) return;
          const center = map.getCenter();
          onChange({ lat: center.lat, lng: center.lng });
        }}
      >
        Place pin at map center
      </Button>
    </div>
  );
}

export type { Point };
