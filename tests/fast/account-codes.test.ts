process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, it } from "bun:test";

// The browser's copies of the code and idle rules (UA-5, UA-9, UA-12). Plain
// functions, so no DOM: the screens only wire these up.

const { CODE_ERROR: SERVER_CODE_ERROR, verificationCode } = await import("../../src/server/lib/validate.js");
const { ACCOUNT_ERROR_CODES } = await import("../../src/server/lib/accounts-errors.js");
const { CODE_ERROR, EMAIL_NOT_CONFIRMED, normalizeCode, validateCode } = await import("../../src/web/lib/codes.js");
const { IDLE_LIMIT_MS, WARNING_MS, countdownAnnouncement, idlePhase } = await import("../../src/web/lib/idle.js");

describe("ACC-09 the code field accepts what the server accepts (UA-5, UA-12)", () => {
  it("agrees with the server on every sample, message for message", () => {
    expect(CODE_ERROR).toBe(SERVER_CODE_ERROR);
    for (const sample of ["123456", "000000", " 123456 ", "12345", "1234567", "12a456", "", "١٢٣٤٥٦"]) {
      const server = verificationCode.safeParse(sample);
      expect(validateCode(sample)).toBe(server.success ? undefined : server.error.issues[0]?.message);
    }
  });

  it("keeps the digits of a pasted code and stops at six", () => {
    expect(normalizeCode("123 456")).toBe("123456");
    expect(normalizeCode("123-456-789")).toBe("123456");
    expect(normalizeCode("abc")).toBe("");
  });

  it("switches to code entry on the same code the server sends", () => {
    expect(EMAIL_NOT_CONFIRMED).toBe(ACCOUNT_ERROR_CODES.emailNotConfirmed);
  });
});

describe("ACC-10 idle sign-out warns at 15 minutes and ends at 16 (UA-9)", () => {
  const start = 1_000_000_000_000;

  it("stays active until the limit", () => {
    expect(idlePhase(start, start)).toEqual({ phase: "active" });
    expect(idlePhase(start, start + IDLE_LIMIT_MS - 1)).toEqual({ phase: "active" });
  });

  it("counts down the last minute in whole seconds", () => {
    expect(IDLE_LIMIT_MS).toBe(15 * 60 * 1000);
    expect(idlePhase(start, start + IDLE_LIMIT_MS)).toEqual({ phase: "warning", secondsLeft: 60 });
    expect(idlePhase(start, start + IDLE_LIMIT_MS + 30_500)).toEqual({ phase: "warning", secondsLeft: 30 });
    expect(idlePhase(start, start + IDLE_LIMIT_MS + WARNING_MS - 1)).toEqual({ phase: "warning", secondsLeft: 1 });
  });

  it("ends the session once the warning runs out, even after a long sleep", () => {
    expect(idlePhase(start, start + IDLE_LIMIT_MS + WARNING_MS)).toEqual({ phase: "expired" });
    expect(idlePhase(start, start + 24 * 60 * 60 * 1000)).toEqual({ phase: "expired" });
  });

  it("announces the countdown to screen readers only at 60, 30 and 10 seconds", () => {
    const spoken = Array.from({ length: 60 }, (_, index) => countdownAnnouncement(60 - index)).filter(Boolean);
    expect(spoken).toEqual([
      "You will be signed out in 60 seconds.",
      "You will be signed out in 30 seconds.",
      "You will be signed out in 10 seconds.",
    ]);
  });
});
