import { describe, expect, it, beforeEach } from "bun:test";

// The address lookup behind "Filled in from the pin": OpenStreetMap's Nominatim,
// throttled to its one-request-per-second policy (src/web/lib/maps.ts).
const { reverseGeocode, resetLookupThrottleForTesting } = await import("../src/web/lib/maps.js");

describe("reverse geocoding", () => {
  beforeEach(() => {
    resetLookupThrottleForTesting();
  });

  it("returns address on successful lookup", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      expect(String(url)).toContain("nominatim.openstreetmap.org/reverse");
      return new Response(JSON.stringify({ display_name: "Makati City Hall, Makati" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    try {
      const result = await reverseGeocode(14.5547, 121.0244);
      expect(result).toBe("Makati City Hall, Makati");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null on 429 rate limit, 500 error, or network error", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // 429 rate limit
      globalThis.fetch = (async () => new Response("Too Many Requests", { status: 429 })) as unknown as typeof fetch;
      const res429 = await reverseGeocode(14.5547, 121.0244);
      expect(res429).toBeNull();

      resetLookupThrottleForTesting();

      // 500 server error
      globalThis.fetch = (async () => new Response("Server Error", { status: 500 })) as unknown as typeof fetch;
      const res500 = await reverseGeocode(14.5547, 121.0244);
      expect(res500).toBeNull();

      resetLookupThrottleForTesting();

      // Network rejection
      globalThis.fetch = (async () => {
        throw new Error("Network unreachable");
      }) as unknown as typeof fetch;
      const resErr = await reverseGeocode(14.5547, 121.0244);
      expect(resErr).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("aborts without fetching when signal is already aborted", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ display_name: "Ignored" }));
    }) as unknown as typeof fetch;

    try {
      const controller = new AbortController();
      controller.abort();
      const result = await reverseGeocode(14.5547, 121.0244, controller.signal);
      expect(result).toBeNull();
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throttles consecutive lookups to start at least 1000ms apart", async () => {
    const originalFetch = globalThis.fetch;
    const fetchTimestamps: number[] = [];

    globalThis.fetch = (async () => {
      fetchTimestamps.push(Date.now());
      return new Response(JSON.stringify({ display_name: "Location" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    try {
      const p1 = reverseGeocode(14.55, 121.01);
      const p2 = reverseGeocode(14.56, 121.02);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe("Location");
      expect(r2).toBe("Location");
      expect(fetchTimestamps.length).toBe(2);

      const interval = fetchTimestamps[1] - fetchTimestamps[0];
      // Interval must be at least 1000 ms (allowing small timer jitter of 5ms)
      expect(interval).toBeGreaterThanOrEqual(995);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("aborts when signal aborts during throttle delay", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount++;
      return new Response(JSON.stringify({ display_name: "Location" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    try {
      const p1 = reverseGeocode(14.55, 121.01);
      const controller = new AbortController();
      const p2 = reverseGeocode(14.56, 121.02, controller.signal);

      setTimeout(() => controller.abort(), 50);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe("Location");
      expect(r2).toBeNull();
      expect(fetchCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("recovers throttle reservation when delayed lookup aborts", async () => {
    const originalFetch = globalThis.fetch;
    const fetchTimestamps: number[] = [];
    globalThis.fetch = (async () => {
      fetchTimestamps.push(Date.now());
      return new Response(JSON.stringify({ display_name: "Location" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    try {
      const p1 = reverseGeocode(14.55, 121.01);

      const controller = new AbortController();
      const p2 = reverseGeocode(14.56, 121.02, controller.signal);
      controller.abort();
      await p2;

      const p3 = reverseGeocode(14.57, 121.03);
      const [r1, r3] = await Promise.all([p1, p3]);

      expect(r1).toBe("Location");
      expect(r3).toBe("Location");
      expect(fetchTimestamps.length).toBe(2);

      const interval = fetchTimestamps[1] - fetchTimestamps[0];
      expect(interval).toBeGreaterThanOrEqual(995);
      expect(interval).toBeLessThan(1500);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
