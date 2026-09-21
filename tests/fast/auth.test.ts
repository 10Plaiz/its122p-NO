import { beforeEach, describe, expect, test } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { ApiError as ServerApiError } from "../../src/server/lib/errors.js";

// Ensure required environment variables exist before importing server modules
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "placeholder-secret-key";

// Browser and DOM polyfills for web client tests in Bun
const storage: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, val: string) => {
    storage[key] = val;
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
  clear: () => {
    for (const k of Object.keys(storage)) delete storage[k];
  },
  key: (i: number) => Object.keys(storage)[i] ?? null,
  length: 0,
} as unknown as Storage;

const dispatchedEvents: Array<{ type: string; detail?: unknown }> = [];
if (typeof globalThis.window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = {} as any;
}
(globalThis.window as any).dispatchEvent = (event: { type: string; detail?: unknown }) => {
  dispatchedEvents.push(event);
  return true;
};
(globalThis.window as any).addEventListener = () => {};
(globalThis.window as any).removeEventListener = () => {};

if (typeof globalThis.CustomEvent === "undefined") {
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class CustomEvent {
    constructor(
      public type: string,
      public initDict?: { detail?: unknown },
    ) {
      this.detail = initDict?.detail;
    }
    detail?: unknown;
  };
}

const { db } = await import("../../src/server/config/supabase.js");
const { requireAuth, requireRole } = await import("../../src/server/middleware/auth.js");
const { api, ApiError: ClientApiError } = await import("../../src/web/lib/api.js");

function createMockReq(headers: Record<string, string> = {}, user?: unknown): Request {
  return {
    get: (headerName: string) => headers[headerName.toLowerCase()],
    user,
  } as unknown as Request;
}

describe("AUTH-01 unauthenticated request handling", () => {
  test("missing authorization header returns 401 with sign-in prompt", async () => {
    const req = createMockReq();
    let errorPassed: unknown;

    await requireAuth(req, {} as Response, ((err?: unknown) => {
      errorPassed = err;
    }) as NextFunction);

    expect(errorPassed).toBeInstanceOf(ServerApiError);
    expect((errorPassed as ServerApiError).status).toBe(401);
    expect((errorPassed as ServerApiError).message).toBe("Sign in to continue.");
  });

  test("expired or invalid token returns 401 with session expired message", async () => {
    const req = createMockReq({ authorization: "Bearer invalid-or-expired-token" });
    const originalGetUser = db.auth.getUser;
    db.auth.getUser = (async () => ({
      data: { user: null },
      error: { message: "Token expired", status: 401, name: "AuthError" } as any,
    })) as any;

    let errorPassed: unknown;
    try {
      await requireAuth(req, {} as Response, ((err?: unknown) => {
        errorPassed = err;
      }) as NextFunction);
    } finally {
      db.auth.getUser = originalGetUser;
    }

    expect(errorPassed).toBeInstanceOf(ServerApiError);
    expect((errorPassed as ServerApiError).status).toBe(401);
    expect((errorPassed as ServerApiError).message).toBe("Your session has expired. Sign in again.");
  });

  test("missing user profile in database returns 401 account no longer exists", async () => {
    const req = createMockReq({ authorization: "Bearer valid-token-no-profile" });
    const originalGetUser = db.auth.getUser;
    const originalFrom = db.from;

    db.auth.getUser = async () => ({
      data: { user: { id: "user-without-profile" } as any },
      error: null,
    });

    db.from = (() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { message: "No rows found" } }),
        }),
      }),
    })) as any;

    let errorPassed: unknown;
    try {
      await requireAuth(req, {} as Response, ((err?: unknown) => {
        errorPassed = err;
      }) as NextFunction);
    } finally {
      db.auth.getUser = originalGetUser;
      db.from = originalFrom;
    }

    expect(errorPassed).toBeInstanceOf(ServerApiError);
    expect((errorPassed as ServerApiError).status).toBe(401);
    expect((errorPassed as ServerApiError).message).toBe("Your account no longer exists.");
  });
});

describe("AUTH-02 deactivated account handling", () => {
  test("inactive profile returns 403 forbidden with administrator contact message", async () => {
    const req = createMockReq({ authorization: "Bearer deactivated-token" });
    const originalGetUser = db.auth.getUser;
    const originalFrom = db.from;

    db.auth.getUser = async () => ({
      data: { user: { id: "deactivated-user-id" } as any },
      error: null,
    });

    db.from = (() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: "deactivated-user-id",
              name: "Deactivated User",
              email: "deactivated@example.com",
              role: "citizen",
              is_active: false,
            },
            error: null,
          }),
        }),
      }),
    })) as any;

    let errorPassed: unknown;
    try {
      await requireAuth(req, {} as Response, ((err?: unknown) => {
        errorPassed = err;
      }) as NextFunction);
    } finally {
      db.auth.getUser = originalGetUser;
      db.from = originalFrom;
    }

    expect(errorPassed).toBeInstanceOf(ServerApiError);
    expect((errorPassed as ServerApiError).status).toBe(403);
    expect((errorPassed as ServerApiError).message).toBe(
      "Your account has been deactivated. Contact an administrator.",
    );
    expect(req.user).toBeUndefined();
  });
});

describe("AUTH-03 session expiration event and token clearance", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    dispatchedEvents.length = 0;
    storage["kamoti.token"] = "mock-active-token";
  });

  test("401 unauthorized dispatches kamoti:auth-expired event", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Your session has expired. Sign in again." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;

    try {
      await api.get("/reports");
    } catch (err) {
      expect(err).toBeInstanceOf(ClientApiError);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0]?.type).toBe("kamoti:auth-expired");
    expect((dispatchedEvents[0]?.detail as { status: number })?.status).toBe(401);
  });

  test("403 deactivated account dispatches kamoti:auth-expired event", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: "Your account has been deactivated. Contact an administrator." }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      )) as unknown as typeof fetch;

    try {
      await api.get("/reports");
    } catch (err) {
      expect(err).toBeInstanceOf(ClientApiError);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0]?.type).toBe("kamoti:auth-expired");
    expect((dispatchedEvents[0]?.detail as { status: number })?.status).toBe(403);
  });

  test("403 role denial does NOT dispatch kamoti:auth-expired event", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "This action is limited to: admin." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;

    try {
      await api.get("/admin/users");
    } catch (err) {
      expect(err).toBeInstanceOf(ClientApiError);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(dispatchedEvents).toHaveLength(0);
  });

  test("/auth/login endpoint failure does NOT dispatch kamoti:auth-expired event", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: "Your account has been deactivated. Contact an administrator." }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      )) as unknown as typeof fetch;

    try {
      await api.post("/auth/login", { email: "deactivated@example.com", password: "password123" });
    } catch (err) {
      expect(err).toBeInstanceOf(ClientApiError);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(dispatchedEvents).toHaveLength(0);
  });
});

describe("AUTHZ-01 role authorization enforcement", () => {
  test("user with permitted role proceeds without error", () => {
    const middleware = requireRole("admin", "staff");
    const req = createMockReq({}, { id: "1", name: "Staff Member", email: "staff@example.com", role: "staff" });
    let nextCalled = false;
    let errorPassed: unknown;

    middleware(req, {} as Response, ((err?: unknown) => {
      nextCalled = true;
      errorPassed = err;
    }) as NextFunction);

    expect(nextCalled).toBe(true);
    expect(errorPassed).toBeUndefined();
  });

  test("user with non-permitted role returns 403 with allowed roles message", () => {
    const middleware = requireRole("admin");
    const req = createMockReq({}, { id: "2", name: "Citizen User", email: "citizen@example.com", role: "citizen" });
    let errorPassed: unknown;

    middleware(req, {} as Response, ((err?: unknown) => {
      errorPassed = err;
    }) as NextFunction);

    expect(errorPassed).toBeInstanceOf(ServerApiError);
    expect((errorPassed as ServerApiError).status).toBe(403);
    expect((errorPassed as ServerApiError).message).toBe("This action is limited to: admin.");
  });

  test("missing req.user in requireRole returns 401 unauthorized", () => {
    const middleware = requireRole("admin");
    const req = createMockReq();
    let errorPassed: unknown;

    middleware(req, {} as Response, ((err?: unknown) => {
      errorPassed = err;
    }) as NextFunction);

    expect(errorPassed).toBeInstanceOf(ServerApiError);
    expect((errorPassed as ServerApiError).status).toBe(401);
  });
});
