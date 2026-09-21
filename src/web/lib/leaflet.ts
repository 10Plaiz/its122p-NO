import L from "leaflet";
import type { ReportStatus } from "./types.js";

// Leaflet's default marker is a PNG resolved relative to the stylesheet, which
// breaks under Vite's bundler and is a blue pin that fights the design system.
// A divIcon avoids both problems: no image asset to resolve, and the marker is a
// square in the token colours — zero radius, like everything else here.

const STATUS_COLOR: Record<ReportStatus, string> = {
  pending: "var(--color-neutral-400)",
  under_review: "var(--color-neutral-600)",
  in_progress: "var(--color-accent)",
  resolved: "var(--color-neutral-900)",
  cancelled: "var(--color-neutral-300)",
};

export function pinFor(status: ReportStatus, selected = false) {
  const size = selected ? 20 : 14;
  return L.divIcon({
    className: "", // Leaflet's default adds a white box; the markup below is all of it.
    html: `<span style="
      display:block;
      width:${size}px;
      height:${size}px;
      background:${STATUS_COLOR[status]};
      border:2px solid var(--color-bg);
      box-shadow:var(--shadow-sm);
    "></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Makati, the LGU in the proposal. Used when a report has no coordinates yet and
// when the board loads with nothing to fit.
export const DEFAULT_CENTER: [number, number] = [14.5547, 121.0244];
export const DEFAULT_ZOOM = 13;

// OpenStreetMap's tile policy asks for attribution; it is required, not decorative.
export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Nominatim asks for <= 1 request/second and refuses bulk use. Screens debounce
// before calling this, and a failure is never fatal: the address field stays
// editable by hand, so a rate-limited lookup costs nothing.
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
