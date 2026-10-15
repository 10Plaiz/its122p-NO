import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import express from "express";
import type { AddressInfo } from "node:net";

// KI-14: account rate limits shared across instances. The store's rules run in
// memory here; the SQL twin is tests/database/auth-rate-limits.sql. These also
// check what the API sends to Postgres, and how it behaves when Postgres fails.

const { db } = await import("../../src/server/config/supabase.js");
const { limitKey, limits, memoryLimitStore, postgresLimitStore, useLimitStore } = await import(
  "../../src/server/lib/rate-limit.js"
);
const { errorHandler } = await import("../../src/server/middleware/error.js");
const { ApiError } = await import("../../src/server/lib/errors.js");

const rule = (key: string, limit: number, window_seconds = 900) => ({ key: limitKey("test", key), limit, window_seconds });

describe("LIM-01 the store counts atomically and gives hits back", () => {
  it("takes until the limit, then refuses with a retry time and counts nothing more", async () => {
    let now = 1_000_000;
    const store = memoryLimitStore(() => now);
    expect(await store.run("take", [rule("a", 2)])).toEqual({ kind: "allowed" });
    expect(await store.run("take", [rule("a", 2)])).toEqual({ kind: "allowed" });
    expect(await store.run("take", [rule("a", 2)])).toEqual({ kind: "limited", retry_after_seconds: 900 });
    now += 900_000;
    expect(await store.run("take", [rule("a", 2)])).toEqual({ kind: "allowed" });
  });

  it("refuses every rule together when one is full, and counts none of them", async () => {
    const store = memoryLimitStore();
    await store.run("take", [rule("full", 1)]);
    expect((await store.run("take", [rule("other", 5), rule("full", 1)])).kind).toBe("limited");
    await store.run("take", [rule("other", 1)]);
    expect((await store.run("take", [rule("other", 1)])).kind).toBe("limited");
  });

  it("releases one hit at a time, never below zero", async () => {
    const store = memoryLimitStore();
    await store.run("take", [rule("r", 1)]);
    await store.run("release", [rule("r", 1)]);
    await store.run("release", [rule("r", 1)]);
    expect((await store.run("take", [rule("r", 1)])).kind).toBe("allowed");
    expect((await store.run("take", [rule("r", 1)])).kind).toBe("limited");
  });

  it("hashes every key, so no address or email is stored in the clear", () => {
    const key = limitKey("login.address", "ana@example.com");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toBe(limitKey("login.address", "ben@example.com"));
  });
});

describe("LIM-02 sign-in counts failures across clients (UA-10, decided 2026-10-15)", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let base = "";
  let status = 401;
  let reached = 0;

  beforeEach(() => {
    useLimitStore(memoryLimitStore());
    status = 401;
    reached = 0;
    const app = express();
    // X-Forwarded-For stands in for different clients.
    app.set("trust proxy", true);
    app.use(express.json());
    app.post("/login", limits.login, (_req, res) => {
      reached += 1;
      res.status(status).json({ error: "answer" });
    });
    app.use(errorHandler);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    server.close();
  });

  const login = (email: string, ip = "198.51.100.1") =>
    fetch(`${base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
      body: JSON.stringify({ email }),
    });

  it("locks one address from one client after ten failures, with Retry-After", async () => {
    for (let i = 0; i < 10; i++) expect((await login("ana@example.com")).status).toBe(401);
    const locked = await login("ana@example.com");
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await login("ben@example.com")).status).toBe(401);
  });

  it("locks one address after twenty failures, whichever clients send them", async () => {
    for (let i = 0; i < 20; i++) expect((await login(i % 2 ? "Ana@Example.com" : "ana@example.com", `198.51.100.${i + 10}`)).status).toBe(401);
    expect((await login("ana@example.com", "203.0.113.9")).status).toBe(429);
    expect((await login("ben@example.com", "203.0.113.9")).status).toBe(401);
  });

  it("never counts a successful sign-in or a server fault", async () => {
    status = 200;
    for (let i = 0; i < 12; i++) expect((await login("ana@example.com")).status).toBe(200);
    status = 500;
    for (let i = 0; i < 12; i++) expect((await login("ana@example.com")).status).toBe(500);
    status = 401;
    expect((await login("ana@example.com")).status).toBe(401);
  });

  it("counts a parallel burst in full, so it cannot slip past the limit", async () => {
    const answers = await Promise.all(Array.from({ length: 25 }, () => login("ana@example.com")));
    expect(answers.filter((answer) => answer.status === 401)).toHaveLength(10);
    expect(reached).toBe(10);
  });

  it("refuses with 503 and runs nothing when the store cannot be reached", async () => {
    useLimitStore({
      run: async () => {
        throw new ApiError(503, "This check is temporarily unavailable. Try again in a minute.", undefined, 60);
      },
    });
    const answer = await login("ana@example.com");
    expect(answer.status).toBe(503);
    expect(answer.headers.get("retry-after")).toBe("60");
    expect(reached).toBe(0);
  });
});

describe("LIM-03 the Postgres store", () => {
  const original = db.rpc;
  let sent: Array<{ fn: string; args: unknown }> = [];

  function answer(result: { data?: unknown; error?: unknown } | Error) {
    (db as unknown as { rpc: unknown }).rpc = (fn: string, args: unknown) => {
      sent.push({ fn, args });
      const promise = result instanceof Error ? Promise.reject(result) : Promise.resolve({ data: null, error: null, ...result });
      return { retry: () => ({ abortSignal: () => promise }) };
    };
  }

  beforeEach(() => {
    sent = [];
  });
  afterEach(() => {
    (db as unknown as { rpc: unknown }).rpc = original;
  });

  it("sends the mode and hashed rules to auth_rate_limit", async () => {
    answer({ data: { kind: "limited", retry_after_seconds: 42 } });
    const rules = [{ key: limitKey("login.address", "ana@example.com"), limit: 20, window_seconds: 900 }];
    expect(await postgresLimitStore.run("take", rules)).toEqual({ kind: "limited", retry_after_seconds: 42 });
    expect(sent).toEqual([{ fn: "auth_rate_limit", args: { p_mode: "take", p_rules: rules } }]);
    expect(JSON.stringify(sent)).not.toContain("ana@example.com");
  });

  it("answers 503 for a database error, a timeout, or an answer it does not expect", async () => {
    for (const result of [{ error: { message: "missing function" } }, new Error("timeout"), { data: { kind: "maybe" } }]) {
      answer(result);
      const error = await postgresLimitStore.run("take", [rule("x", 1)]).catch((caught: unknown) => caught);
      expect((error as { status?: number }).status).toBe(503);
    }
  });
});
