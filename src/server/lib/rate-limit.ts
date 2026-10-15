import { createHash } from "node:crypto";
import { ipKeyGenerator } from "express-rate-limit";
import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { db } from "../config/supabase.js";
import { ApiError } from "./errors.js";

// Throttles for the account endpoints that guess at a secret (a password, a
// 6-digit code) or make Supabase send something (an email, a text message), and
// for citizen comments. Supabase Auth has its own per-IP limits as well; these sit
// in front of them so the API answers in its own words and a single client cannot
// burn the project's hourly email allowance for everyone.
//
// KI-14: the counts live in Postgres (auth_rate_limit(), migration
// 20261015000100), so every server instance shares them. Keys are SHA-256 hashes,
// so the table holds no address or email in the clear. If the store cannot be
// reached the request is refused with 503, as citizen quotas are: a database
// outage stops sign-in anyway.
//
// Every attempt is counted before the route runs, atomically, so a burst of
// parallel guesses cannot slip past the limit. Where only failures count, a
// success hands its hit back before the response is sent: Vercel can freeze a
// function as soon as it answers, so anything left for after may never happen.

const MINUTE = 60 * 1000;

export type LimitMode = "take" | "release";
export type StoreRule = { key: string; limit: number; window_seconds: number };
export type LimitResult = { kind: "allowed" } | { kind: "limited"; retry_after_seconds: number };

// take: if no rule is at its limit, count one hit on each, atomically.
// release: give one hit back on each rule (never below zero).
export interface LimitStore {
  run(mode: LimitMode, rules: StoreRule[]): Promise<LimitResult>;
}

const resultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allowed") }).strict(),
  z.object({ kind: z.literal("limited"), retry_after_seconds: z.number().int().positive().max(86_400) }).strict(),
]);

function unavailable() {
  return new ApiError(503, "This check is temporarily unavailable. Try again in a minute.", { code: "rate_limit_unavailable" }, 60);
}

export const postgresLimitStore: LimitStore = {
  async run(mode, rules) {
    let response;
    try {
      response = await db
        .rpc("auth_rate_limit", { p_mode: mode, p_rules: rules })
        .retry(false)
        .abortSignal(AbortSignal.timeout(5000));
    } catch {
      throw unavailable();
    }
    if (response.error) throw unavailable();
    const result = resultSchema.safeParse(response.data);
    if (!result.success) throw unavailable();
    return result.data;
  },
};

// The same rules in one process's memory, for the fast tests. `now` lets a test
// move the clock.
export function memoryLimitStore(now: () => number = Date.now): LimitStore {
  const counters = new Map<string, { hits: number; resetAt: number }>();
  const live = (key: string) => {
    const counter = counters.get(key);
    return counter && counter.resetAt > now() ? counter : undefined;
  };
  return {
    async run(mode, rules) {
      if (mode === "release") {
        for (const rule of rules) {
          const counter = live(rule.key);
          if (counter) counter.hits = Math.max(0, counter.hits - 1);
        }
        return { kind: "allowed" };
      }
      let retryAt = 0;
      for (const rule of rules) {
        const counter = live(rule.key);
        if (counter && counter.hits >= rule.limit) retryAt = Math.max(retryAt, counter.resetAt);
      }
      if (retryAt) return { kind: "limited", retry_after_seconds: Math.max(1, Math.ceil((retryAt - now()) / 1000)) };
      for (const rule of rules) {
        const counter = live(rule.key);
        if (counter) counter.hits += 1;
        else counters.set(rule.key, { hits: 1, resetAt: now() + rule.window_seconds * 1000 });
      }
      return { kind: "allowed" };
    },
  };
}

let store: LimitStore = postgresLimitStore;

// The test seam: tests/fast/preload.ts installs the memory store.
export function useLimitStore(next: LimitStore) {
  store = next;
}

export function limitKey(name: string, subject: string) {
  return createHash("sha256").update(`kamoti:auth-limit:${name}:${subject}`).digest("hex");
}

// One counted dimension. `subject` returns null when the rule does not apply to
// this request (for example, no email in the body).
type Rule = { name: string; windowMs: number; limit: number; subject: (req: Request) => string | null };

type LimitOptions = {
  message: string;
  rules: Rule[];
  // Count only failed requests (4xx other than 429), so a person who signs in
  // correctly is never slowed down by their own earlier typos. Server faults are
  // never counted against the person.
  failuresOnly?: boolean;
  skip?: (req: Request) => boolean;
};

function storeRules(rules: Rule[], req: Request): StoreRule[] {
  return rules.flatMap((rule) => {
    const subject = rule.subject(req);
    return subject === null ? [] : [{ key: limitKey(rule.name, subject), limit: rule.limit, window_seconds: rule.windowMs / 1000 }];
  });
}

function isCountedFailure(status: number) {
  return status >= 400 && status < 500 && status !== 429;
}

// Holds back a response that is not a counted failure until its hit is given
// back, then sends it.
function releaseUnlessFailedBeforeEnd(res: Response, rules: StoreRule[]) {
  const end = res.end as (...args: unknown[]) => Response;
  res.end = function (this: Response, ...args: unknown[]) {
    res.end = end as Response["end"];
    if (isCountedFailure(res.statusCode)) return end.apply(this, args);
    store
      .run("release", rules)
      .catch((error: unknown) => console.error("Could not release an attempt:", error instanceof Error ? error.message : error))
      .finally(() => end.apply(this, args));
    return this;
  } as Response["end"];
}

export function limit({ message, rules, failuresOnly = false, skip }: LimitOptions): RequestHandler {
  return async (req, res, next) => {
    if (skip?.(req)) return next();
    const keyed = storeRules(rules, req);
    if (keyed.length === 0) return next();

    const result = await store.run("take", keyed);
    // Through the shared error handler, so a 429 has the same { error } shape as
    // every other rejection and carries Retry-After.
    if (result.kind === "limited") throw new ApiError(429, message, undefined, result.retry_after_seconds);

    if (failuresOnly) releaseUnlessFailedBeforeEnd(res, keyed);
    next();
  };
}

function client(req: Request) {
  return ipKeyGenerator(req.ip ?? "unknown");
}

function bodyEmail(req: Request) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return email || null;
}

const WAIT = "Too many attempts. Wait a few minutes, then try again.";

export const limits = {
  // UA-10. Thirty wrong passwords from one client lock that client out whatever
  // addresses it tries; ten for one address from one client lock that pair out;
  // twenty for one address from any clients lock that address out (decided
  // 2026-10-15). A locked-out owner can still reset by code.
  login: limit({
    message: WAIT,
    failuresOnly: true,
    rules: [
      { name: "login.client", windowMs: 15 * MINUTE, limit: 30, subject: client },
      {
        name: "login.client-address",
        windowMs: 15 * MINUTE,
        limit: 10,
        subject: (req) => `${client(req)}|${bodyEmail(req) ?? ""}`,
      },
      { name: "login.address", windowMs: 15 * MINUTE, limit: 20, subject: bodyEmail },
    ],
  }),
  register: limit({
    message: "Too many accounts were created from this device. Try again in an hour.",
    rules: [{ name: "register.client", windowMs: 60 * MINUTE, limit: 5, subject: client }],
  }),
  // A 6-digit code has a million values; ten guesses per quarter hour makes
  // guessing one hopeless before Supabase expires it.
  verify: limit({
    message: WAIT,
    failuresOnly: true,
    rules: [{ name: "verify.client", windowMs: 15 * MINUTE, limit: 10, subject: client }],
  }),
  sendCode: limit({
    message: "Too many codes were requested. Wait a few minutes before asking for another.",
    rules: [{ name: "code.client", windowMs: 15 * MINUTE, limit: 5, subject: client }],
  }),
  refresh: limit({
    message: WAIT,
    rules: [{ name: "refresh.client", windowMs: 15 * MINUTE, limit: 60, subject: client }],
  }),
  // RS-6: each comment notifies staff and every administrator, so ten an hour per
  // citizen keeps real follow-ups and stops a flood (decision 2026-10-03). Staff
  // and admin remarks are the work itself and are never throttled.
  citizenComment: limit({
    message: "You can send up to 10 comments an hour. Try again later.",
    skip: (req) => req.user?.role !== "citizen",
    rules: [{ name: "comment.citizen", windowMs: 60 * MINUTE, limit: 10, subject: (req) => req.user?.id ?? null }],
  }),
};
