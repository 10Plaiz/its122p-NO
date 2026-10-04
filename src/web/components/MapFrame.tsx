import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  APILoadingStatus,
  APIProvider,
  ControlPosition,
  MapControl,
  Polygon,
  useApiLoadingStatus,
} from "@vis.gl/react-google-maps";
import { MAKATI_PATHS, googleMapsApiKey, readToken } from "../lib/maps.js";

// The shell every Google map in the app sits in: it loads the Maps script only on
// screens that show a map, and stands in with a plain message when there is no key
// (CI, tests, a fresh clone) or Google refuses it, so a missing map never takes the
// rest of the screen down with it.

export function MapFrame({ children, unavailable }: { children: ReactNode; unavailable?: ReactNode }) {
  const apiKey = googleMapsApiKey();
  if (!apiKey) {
    return (
      <MapUnavailable message="This copy of KAMOTI has no Google Maps key, so the map cannot be shown.">
        {unavailable}
      </MapUnavailable>
    );
  }

  return (
    // Every map passes the same options, so the script loads once however many
    // frames a screen has.
    <APIProvider apiKey={apiKey} region="PH" language="en">
      <LoadGate unavailable={unavailable}>{children}</LoadGate>
    </APIProvider>
  );
}

function LoadGate({ children, unavailable }: { children: ReactNode; unavailable?: ReactNode }) {
  const status = useApiLoadingStatus();

  if (status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <MapUnavailable message="Google Maps refused this site's key. An administrator needs to check the key's restrictions.">
        {unavailable}
      </MapUnavailable>
    );
  }
  if (status === APILoadingStatus.FAILED) {
    return (
      <MapUnavailable message="Google Maps did not load. Check your connection, then reload the page.">
        {unavailable}
      </MapUnavailable>
    );
  }
  return children;
}

function MapUnavailable({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div
      role="status"
      data-testid="map-unavailable"
      className="h-full min-h-[inherit] flex flex-col justify-center items-start gap-1.5 p-6 bg-neutral-200"
    >
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-muted">
        Map unavailable
      </span>
      <p className="text-[13px] leading-snug max-w-prose !m-0">{message}</p>
      {children && <div className="text-muted text-[12px] leading-snug max-w-prose">{children}</div>}
    </div>
  );
}

// Makati's boundary drawn on the map, so where a pin is allowed is visible rather
// than discovered by being refused. Not clickable: a tap on the line still reaches
// the map underneath.
// `fallback` is the token's own value, for the moment before the stylesheet applies.
export function MakatiOutline({
  token = "--color-neutral-700",
  fallback = "#605d5d",
}: {
  token?: string;
  fallback?: string;
}) {
  // Read once per mount: the polygon is drawn on a canvas, which cannot follow a
  // CSS variable, and the tokens do not change while a screen is open.
  const color = useMemo(() => readToken(token, fallback), [token, fallback]);
  return (
    <>
      <Polygon
        paths={MAKATI_PATHS}
        clickable={false}
        strokeColor={color}
        strokeOpacity={0.9}
        strokeWeight={2}
        fillOpacity={0}
      />
      {/* The outline is OpenStreetMap data, and ODbL asks for the credit wherever it
          is shown. Google credits its own map. Just above Google's logo. */}
      <MapControl position={ControlPosition.LEFT_BOTTOM}>
        <span className="mb-0.5 ml-1.5 inline-block bg-bg/80 px-1 font-mono text-[10px] text-muted">
          Boundary &copy;{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>
        </span>
      </MapControl>
    </>
  );
}
