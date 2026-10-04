import { MAKATI_BBOX, MAKATI_HOLES, MAKATI_OUTER } from "../../server/lib/makati-boundary.js";
import type { ReportStatus } from "./types.js";

// Everything the Google map components share that is not React: the key, the camera
// limits, the pin colours, and the Makati boundary. Kept free of the map library so
// tests can import it without a browser.

// One boundary for the browser and the API. The data file has no imports, so taking
// it from the server tree adds nothing else to the bundle.
export {
  MAKATI_BBOX,
  MAKATI_ERROR,
  MAKATI_HOLES,
  MAKATI_OUTER,
  isInsideMakati,
} from "../../server/lib/makati-boundary.js";

export type LatLng = { lat: number; lng: number };

// The browser key ships in the page by design; Google Cloud restricts it to the
// site's referrers and the Maps APIs. Missing (CI, tests, a fresh clone) or still the
// .env.example placeholder means no map, and the components say so instead of
// loading a script that can only fail.
export function googleMapsApiKey(): string | null {
  const key = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "").trim();
  if (!key || key === "your-browser-key") return null;
  return key;
}

// Advanced markers need a map ID. Google documents DEMO_MAP_ID for development; a
// project can supply its own (cloud styling, usage reports) without a code change.
export function googleMapId(): string {
  return String(import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "").trim() || "DEMO_MAP_ID";
}

// Makati City Hall area. Used when a report has no coordinates yet and when the
// board loads with nothing to fit.
export const DEFAULT_CENTER: LatLng = { lat: 14.5547, lng: 121.0244 };
export const DEFAULT_ZOOM = 14;
// Below this the whole city is a few pixels wide; no one picks a spot from there.
export const MIN_ZOOM = 13;
// Close enough to tell one side of a street from the other.
export const DETAIL_ZOOM = 16;

// The camera may not leave Makati plus a margin. The margin keeps the edge barangays
// from sitting flush against the frame, and lets the outline show where the city
// stops. Panning limits only the view: whether a pin counts is the polygon's call.
const VIEW_MARGIN = 0.012;
export const MAP_RESTRICTION = {
  latLngBounds: {
    south: MAKATI_BBOX.south - VIEW_MARGIN,
    west: MAKATI_BBOX.west - VIEW_MARGIN,
    north: MAKATI_BBOX.north + VIEW_MARGIN,
    east: MAKATI_BBOX.east + VIEW_MARGIN,
  },
  strictBounds: false,
};

// Place search is limited to the city's box; anything it returns is still checked
// against the polygon, since the box takes in slivers of Taguig and Manila.
export const SEARCH_BOUNDS = {
  south: MAKATI_BBOX.south,
  west: MAKATI_BBOX.west,
  north: MAKATI_BBOX.north,
  east: MAKATI_BBOX.east,
};

// The boundary as Google's polygon paths: outer ring first, then the hole.
export const MAKATI_PATHS: LatLng[][] = [MAKATI_OUTER, ...MAKATI_HOLES].map((ring) =>
  ring.map(([lng, lat]) => ({ lat, lng })),
);

// Pins are squares in the token colours, zero radius like everything else here.
// Only the active status carries the accent, matching StatusBadge.
export const STATUS_COLOR: Record<ReportStatus, string> = {
  pending: "var(--color-neutral-400)",
  under_review: "var(--color-neutral-600)",
  in_progress: "var(--color-accent)",
  resolved: "var(--color-success-700)",
  cancelled: "var(--color-neutral-300)",
  rejected: "var(--color-neutral-800)",
};

// Google draws polygons on a canvas, which cannot read CSS variables, so the token is
// resolved to its value first. The fallback only covers a document without the
// stylesheet (it is the same token value).
export function readToken(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// Reverse geocoding stays on OpenStreetMap's Nominatim: it needs no extra Google API
// enabled on the key, and a failure is never fatal because the address field stays
// editable by hand. Nominatim asks for <= 1 request/second and refuses bulk use, so
// screens debounce before calling this and calls are spaced here as well.
let nextAvailableLookupTime = 0;

export function resetLookupThrottleForTesting() {
  nextAvailableLookupTime = 0;
}

export async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const now = Date.now();
  const scheduledTime = Math.max(now, nextAvailableLookupTime);
  nextAvailableLookupTime = scheduledTime + 1000;

  const delay = scheduledTime - now;
  if (delay > 0) {
    const aborted = await new Promise<boolean>((resolve) => {
      const onAbort = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve(false);
      }, delay);
      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });

    if (aborted || signal?.aborted) {
      if (nextAvailableLookupTime === scheduledTime + 1000) {
        nextAvailableLookupTime = scheduledTime;
      }
      return null;
    }
  }

  const query = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lon),
    zoom: "18",
    addressdetails: "1",
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { display_name?: string };
    return payload.display_name ?? null;
  } catch {
    return null;
  }
}
