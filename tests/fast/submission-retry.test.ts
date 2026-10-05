import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { ApiError, api } from "../../src/web/lib/api.js";

const NOW = 1_791_158_400_000;

describe("Citizen submission retry guidance", () => {
  const storage = new Map<string, string>();
  const events: string[] = [];
  let windowDescriptor: PropertyDescriptor | undefined;
  let storageDescriptor: PropertyDescriptor | undefined;
  let fetchMock = spyOn(globalThis, "fetch");
  let nowMock = spyOn(Date, "now");

  beforeEach(() => {
    fetchMock = spyOn(globalThis, "fetch");
    nowMock = spyOn(Date, "now");
    windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const fakeWindow = new EventTarget();
    for (const name of ["kamoti:auth-expired", "kamoti:session-refreshed", "kamoti:residency-required"]) {
      fakeWindow.addEventListener(name, () => events.push(name));
    }
    Object.defineProperty(globalThis, "window", { value: fakeWindow, configurable: true });
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      configurable: true,
    });
    storage.clear();
    storage.set("kamoti.token", "citizen-access");
    storage.set("kamoti.refresh", "citizen-refresh");
    events.length = 0;
    fetchMock.mockClear();
    nowMock.mockReturnValue(NOW);
  });

  afterEach(() => {
    fetchMock.mockRestore();
    nowMock.mockRestore();
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });

  async function refusal(response: Response, upload?: FormData): Promise<ApiError> {
    fetchMock.mockResolvedValueOnce(response);
    try {
      if (upload) await api.upload("/auth/me/residency-proof", upload);
      else await api.post("/reports", { title: "Broken lamp" });
    } catch (error: unknown) {
      if (error instanceof ApiError) return error;
      throw error;
    }
    throw new Error("Expected the submission to be refused.");
  }

  test("429 exposes a retry deadline without changing the server message or ending the session", async () => {
    const error = await refusal(new Response(JSON.stringify({
      error: "You have submitted too many reports.",
      details: { code: "citizen_submission_limited" },
    }), { status: 429, headers: { "Retry-After": "90" } }));

    expect(error.status).toBe(429);
    expect(error.message).toBe("You have submitted too many reports.");
    expect(error.code).toBe("citizen_submission_limited");
    expect(error.retry).toEqual({ afterSeconds: 90, at: new Date("2026-10-05T00:01:30.000Z") });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.get("kamoti.token")).toBe("citizen-access");
    expect(storage.get("kamoti.refresh")).toBe("citizen-refresh");
    expect(events).toEqual([]);
  });

  test("503 accepts an HTTP-date deadline and preserves the proof File for a manual retry", async () => {
    const proof = new File(["synthetic proof"], "proof.pdf", { type: "application/pdf" });
    const form = new FormData();
    form.set("proof", proof);
    const error = await refusal(new Response(JSON.stringify({
      error: "Submissions are temporarily unavailable.",
      details: { code: "citizen_submission_unavailable" },
    }), { status: 503, headers: { "Retry-After": "Mon, 05 Oct 2026 00:02:00 GMT" } }), form);

    expect(error.retry).toEqual({ afterSeconds: 120, at: new Date("2026-10-05T00:02:00.000Z") });
    expect(error.message).toBe("Submissions are temporarily unavailable.");
    const deadline = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" })
      .format(new Date("2026-10-05T00:02:00.000Z"));
    expect(error.displayMessage).toBe(`Submissions are temporarily unavailable. Try again after ${deadline}.`);
    const retained = form.get("proof");
    expect(retained).toBeInstanceOf(File);
    if (!(retained instanceof File)) throw new Error("Expected the selected proof File to remain attached.");
    expect(retained.name).toBe("proof.pdf");
    expect(await retained.text()).toBe("synthetic proof");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.get("kamoti.token")).toBe("citizen-access");
    expect(events).toEqual([]);
  });

  test.each(["-1", "1.5", "tomorrow", "999999999999999999999999"])(
    "malformed Retry-After %s falls back to validated server metadata",
    async (header) => {
      const error = await refusal(new Response(JSON.stringify({
        error: "Wait before sending another report.",
        details: {
          code: "citizen_submission_limited",
          retry_after_seconds: 180,
          retry_at: "2026-10-05T00:03:00.000Z",
        },
      }), { status: 429, headers: { "Retry-After": header } }));

      expect(error.retry).toEqual({ afterSeconds: 180, at: new Date("2026-10-05T00:03:00.000Z") });
      expect(error.code).toBe("citizen_submission_limited");
    },
  );

  test("body retry seconds work when the header and deadline are absent", async () => {
    const error = await refusal(new Response(JSON.stringify({
      error: "Try again later.",
      details: { retry_after_seconds: 45 },
    }), { status: 503 }));

    expect(error.retry).toEqual({ afterSeconds: 45, at: new Date("2026-10-05T00:00:45.000Z") });
  });

  test.each([
    { retry_after_seconds: -1 },
    { retry_after_seconds: 1.5 },
    { retry_after_seconds: "60" },
    { retry_at: "not a timestamp" },
    { retry_at: "2026-02-31T00:00:00Z" },
  ])("invalid retry metadata keeps the server's useful error", async (details) => {
    const error = await refusal(new Response(JSON.stringify({ error: "Please wait and try again.", details }), {
      status: 429,
      headers: { "Retry-After": "not a date" },
    }));

    expect(error.retry).toBeUndefined();
    expect(error.displayMessage).toBe("Please wait and try again.");
    expect(error.details).toEqual(details);
  });

  test("past HTTP dates produce zero remaining seconds", async () => {
    const error = await refusal(new Response(JSON.stringify({ error: "Please try again." }), {
      status: 429,
      headers: { "Retry-After": "Sun, 04 Oct 2026 23:59:00 GMT" },
    }));

    expect(error.retry).toEqual({ afterSeconds: 0, at: new Date("2026-10-04T23:59:00.000Z") });
  });

  test("ordinary validation errors retain their message and field errors without retry guidance", async () => {
    const error = await refusal(new Response(JSON.stringify({
      error: "Check the highlighted fields.",
      details: [{ field: "title", message: "Give the report a title of at least 3 characters." }],
    }), { status: 400, headers: { "Retry-After": "60" } }));

    expect(error.status).toBe(400);
    expect(error.message).toBe("Check the highlighted fields.");
    expect(error.displayMessage).toBe("Check the highlighted fields.");
    expect(error.fieldErrors).toEqual({ title: "Give the report a title of at least 3 characters." });
    expect(error.retry).toBeUndefined();
    expect(events).toEqual([]);
  });

  test("an HTML proxy refusal keeps the existing fallback message", async () => {
    const error = await refusal(new Response("<html>Unavailable</html>", { status: 503 }));

    expect(error.message).toBe("Something went wrong. Try again.");
    expect(error.displayMessage).toBe("Something went wrong. Try again.");
    expect(error.retry).toBeUndefined();
  });
});
