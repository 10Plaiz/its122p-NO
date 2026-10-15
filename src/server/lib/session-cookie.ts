import type { CookieOptions, NextFunction, Request, Response } from "express";
import { ApiError } from "./errors.js";

// KI-12. The refresh token lives in an HttpOnly cookie, so a script injected into
// the page cannot read it and keep a stolen session alive. The access token stays
// in the browser: it expires within the hour and is sent as a bearer header.
//
// SameSite=Strict keeps other sites from sending the cookie, and the cookie only
// travels to /api/auth. /refresh also needs SESSION_HEADER, which a cross-site
// form cannot set and a cross-origin fetch cannot send without CORS approval.

export const REFRESH_COOKIE = "kamoti_refresh";
export const SESSION_HEADER = "X-KAMOTI-Session";
export const REFRESH_COOKIE_DAYS = 7;

function cookieOptions(req: Request): CookieOptions {
  // req.secure is true on Vercel (trust proxy) and false on local http, where a
  // Secure cookie would not be sent back by every browser.
  return { httpOnly: true, sameSite: "strict", secure: req.secure, path: "/api/auth" };
}

// Sets the cookie and returns the session without its refresh token, for the JSON body.
export function issueSession<T extends { refresh_token: string }>(req: Request, res: Response, session: T): Omit<T, "refresh_token"> {
  const { refresh_token, ...body } = session;
  res.cookie(REFRESH_COOKIE, refresh_token, { ...cookieOptions(req), maxAge: REFRESH_COOKIE_DAYS * 24 * 60 * 60 * 1000 });
  return body;
}

export function clearRefreshCookie(req: Request, res: Response) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(req));
}

export function readRefreshCookie(req: Request): string | null {
  for (const part of (req.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== REFRESH_COOKIE) continue;
    try {
      return decodeURIComponent(rest.join("=")) || null;
    } catch {
      return null;
    }
  }
  return null;
}

export function requireSessionHeader(req: Request, _res: Response, next: NextFunction) {
  if (req.get(SESSION_HEADER) !== "1") return next(new ApiError(403, "Sign in again from the KAMOTI site."));
  next();
}
