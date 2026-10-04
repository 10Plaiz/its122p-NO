import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Request } from "express";
import { ApiError } from "./errors.js";

// Throttles for the account endpoints that guess at a secret (a password, a
// 6-digit code) or make Supabase send something (an email, a text message).
// Supabase Auth has its own per-IP limits as well; these sit in front of them so
// the API answers in its own words and a single client cannot burn the project's
// hourly email and SMS allowance for everyone.
//
// The store is in memory, so each server instance counts on its own. On a single
// Node process that is exact; on a serverless deployment with several warm
// instances it is a floor, not a ceiling (see the S1 handoff).

const MINUTE = 60 * 1000;

type LimitOptions = {
  windowMs: number;
  limit: number;
  message: string;
  // Count only failed requests, so a person who signs in correctly is never
  // slowed down by their own earlier typos.
  failuresOnly?: boolean;
  // Also key by the email in the body, so one address cannot be hammered from
  // a rotating set of IPs faster than a single IP could manage.
  perEmail?: boolean;
  // Key by the signed-in account instead of the client, and count citizens only.
  // Needs requireAuth first.
  perCitizen?: boolean;
};

function clientKey(req: Request) {
  return ipKeyGenerator(req.ip ?? "unknown");
}

function emailKey(req: Request) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return `${clientKey(req)}|${email}`;
}

function citizenKey(req: Request) {
  return `user:${req.user?.id ?? clientKey(req)}`;
}

export function limit({ windowMs, limit: max, message, failuresOnly = false, perEmail = false, perCitizen = false }: LimitOptions) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: failuresOnly,
    keyGenerator: perCitizen ? citizenKey : perEmail ? emailKey : clientKey,
    // Staff and admin remarks are the work itself and are never throttled.
    skip: perCitizen ? (req) => req.user?.role !== "citizen" : undefined,
    // Goes through the shared error handler so a 429 has the same { error } shape
    // as every other rejection and the screens show it like any other message.
    handler: (_req, _res, next) => next(new ApiError(429, message)),
  });
}

const WAIT = "Too many attempts. Wait a few minutes, then try again.";

export const limits = {
  // Ten wrong passwords for one address from one client locks that pair out for
  // fifteen minutes; thirty from one client locks the client out whatever
  // addresses it tries.
  loginPerAccount: limit({ windowMs: 15 * MINUTE, limit: 10, message: WAIT, failuresOnly: true, perEmail: true }),
  loginPerClient: limit({ windowMs: 15 * MINUTE, limit: 30, message: WAIT, failuresOnly: true }),
  register: limit({ windowMs: 60 * MINUTE, limit: 5, message: "Too many accounts were created from this device. Try again in an hour." }),
  // A 6-digit code has a million values; ten guesses per quarter hour makes
  // guessing one hopeless before Supabase expires it.
  verify: limit({ windowMs: 15 * MINUTE, limit: 10, message: WAIT, failuresOnly: true }),
  sendCode: limit({
    windowMs: 15 * MINUTE,
    limit: 5,
    message: "Too many codes were requested. Wait a few minutes before asking for another.",
  }),
  refresh: limit({ windowMs: 15 * MINUTE, limit: 60, message: WAIT }),
  // UA-8: a few retries for a wrong or blurry file, not a way to fill the bucket.
  proofUpload: limit({ windowMs: 60 * MINUTE, limit: 10, message: "Too many uploads. Try again in an hour." }),
  // RS-6: each comment notifies staff and every administrator, so ten an hour per
  // citizen keeps real follow-ups and stops a flood (decision 2026-10-03).
  citizenComment: limit({
    windowMs: 60 * MINUTE,
    limit: 10,
    message: "You can send up to 10 comments an hour. Try again later.",
    perCitizen: true,
  }),
};
