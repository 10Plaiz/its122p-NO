// The one place the browser talks to the API. Every screen goes through here, so
// the token header, the error shape and the query encoding are defined once.
//
// Vite proxies /api to the Express server on :4000 in development; in production
// Vercel rewrites the same path to the Node function. Relative URLs work in both.

import { z } from "zod";
import type { Session } from "./types.js";

export const TOKEN_KEY = "kamoti.token";
const REFRESH_KEY = "kamoti.refresh";
export const EXPIRES_KEY = "kamoti.expires";

// Fired on window after a refresh stores a new session; detail is the Session.
export const SESSION_REFRESHED_EVENT = "kamoti:session-refreshed";

// Fired on window when the server says a citizen must upload a proof of residency
// first (UA-8), e.g. after an administrator rejected theirs mid-session.
export const RESIDENCY_REQUIRED_EVENT = "kamoti:residency-required";

// Routes that take no session, or that end or renew one. A 401 from these is
// about the request itself, never a reason to refresh or to end the session.
const SESSIONLESS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/verify-email",
  "/auth/resend-code",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/refresh",
  "/auth/logout",
]);

type SubmissionRetry = { afterSeconds: number; at: Date };

const retryDetailsSchema = z.object({
  retry_after_seconds: z.number().int().nonnegative().safe().optional(),
  retry_at: z.iso.datetime({ offset: true }).optional(),
});

function submissionRetry(response: Response, details: unknown): SubmissionRetry | undefined {
  if (response.status !== 429 && response.status !== 503) return undefined;
  const now = Date.now();
  const header = response.headers.get("Retry-After")?.trim();
  if (header && /^\d+$/.test(header)) {
    const seconds = Number(header);
    const at = new Date(now + seconds * 1000);
    if (Number.isSafeInteger(seconds) && Number.isFinite(at.getTime())) return { afterSeconds: seconds, at };
  }
  if (header && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(header)) {
    const at = new Date(header);
    if (Number.isFinite(at.getTime()) && at.toUTCString() === header) {
      return { afterSeconds: Math.max(0, Math.ceil((at.getTime() - now) / 1000)), at };
    }
  }
  const parsed = retryDetailsSchema.safeParse(details);
  if (!parsed.success) return undefined;
  if (parsed.data.retry_at !== undefined) {
    const at = new Date(parsed.data.retry_at);
    if (Number.isFinite(at.getTime())) return { afterSeconds: Math.max(0, Math.ceil((at.getTime() - now) / 1000)), at };
  }
  if (parsed.data.retry_after_seconds !== undefined) {
    const seconds = parsed.data.retry_after_seconds;
    const at = new Date(now + seconds * 1000);
    if (Number.isFinite(at.getTime())) return { afterSeconds: seconds, at };
  }
  return undefined;
}

// The server's error shape, from src/server/middleware/error.ts.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
    public retry?: SubmissionRetry,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get displayMessage(): string {
    if (!this.retry) return this.message;
    const deadline = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(this.retry.at);
    return `${this.message} Try again after ${deadline}.`;
  }

  // A machine-readable reason, such as "email_not_confirmed", for a screen that
  // switches to a next step instead of only showing the message.
  get code(): string | undefined {
    const details = this.details;
    return details && typeof details === "object" && "code" in details && typeof details.code === "string" ? details.code : undefined;
  }

  // zod rejections arrive as [{ field, message }] so a form can mark its own inputs.
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const entries: Record<string, string> = {};
    for (const issue of this.details) {
      if (issue && typeof issue === "object" && "field" in issue && "message" in issue) {
        entries[String(issue.field)] = String(issue.message);
      }
    }
    return entries;
  }
}

// localStorage throws in some privacy modes, so every access is guarded.
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// KI-13: sign-out sends it, so the server can end a session whose access token has
// already expired.
export function getRefreshToken(): string | null {
  return read(REFRESH_KEY);
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// UA-9. The refresh token sits beside the access token in localStorage (agreed
// 2026-10-03). Every tab reads the same keys, so a refresh in one tab is seen by all.
export function storeSession(session: Pick<Session, "access_token" | "refresh_token" | "expires_at">) {
  try {
    localStorage.setItem(TOKEN_KEY, session.access_token);
    localStorage.setItem(REFRESH_KEY, session.refresh_token);
    localStorage.setItem(EXPIRES_KEY, String(session.expires_at));
  } catch {
    // A session that cannot be persisted still works until the tab closes.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    // Last, because other tabs treat the token's removal as the sign-out.
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

// Seconds since the epoch, as Supabase sends it; null for a session stored before
// refresh existed, which then simply lasts until its token expires.
export function getExpiresAt(): number | null {
  const value = Number(read(EXPIRES_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Refresh this long before the access token expires, so a request in flight never
// carries a token that runs out on the way.
export const REFRESH_MARGIN_MS = 60 * 1000;

export function refreshDelay(expiresAt: number, now: number): number {
  // setTimeout fires at once for anything above 2^31 - 1 ms.
  return Math.min(Math.max(0, expiresAt * 1000 - REFRESH_MARGIN_MS - now), 2 ** 31 - 1);
}

let refreshing: Promise<boolean> | null = null;

// One refresh at a time: in this tab through the shared promise, across tabs
// through a Web Lock where the browser has them. Supabase rotates refresh tokens,
// so two tabs spending the same one at once would end with one of them refused.
// Resolves true when there is a fresh token to use.
export function refreshSession(): Promise<boolean> {
  refreshing ??= withRefreshLock(runRefresh).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function withRefreshLock(task: (spent: string) => Promise<boolean>): Promise<boolean> {
  const spent = read(REFRESH_KEY);
  if (!spent) return Promise.resolve(false);
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? locks.request("kamoti.refresh", () => task(spent)) : task(spent);
}

async function runRefresh(spent: string): Promise<boolean> {
  // Another tab refreshed while this one waited for the lock: use its session.
  const current = read(REFRESH_KEY);
  if (current !== spent) return current !== null;

  let response: Response;
  try {
    response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: spent }),
    });
  } catch {
    // Offline. Keep the session; the next request or timer tries again.
    return false;
  }

  if (!response.ok) {
    // The server refused the token itself (expired, revoked, deactivated). A
    // throttle or an outage is not the session's fault, so that keeps it.
    if (response.status === 401 || response.status === 403) clearSession();
    return false;
  }

  const session = (await response.json().catch(() => null)) as Session | null;
  if (!session?.access_token) return false;
  storeSession(session);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SESSION_REFRESHED_EVENT, { detail: session }));
  return true;
}

// Drops undefined, empty strings and nulls so a cleared filter leaves the URL
// rather than being sent as "?status=".
export type Query = Record<string, string | number | boolean | null | undefined>;

export function toQuery(params: Query = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  query?: Query;
  // Set for multipart uploads; the browser must write its own Content-Type
  // boundary, so we never set that header ourselves.
  formData?: FormData;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const { method = "GET", body, query, formData, signal } = options;

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`/api${path}${toQuery(query)}`, {
    method,
    headers,
    body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
    signal,
  });

  if (response.status === 204) return undefined as T;

  // A crash or a proxy failure can return HTML, so never assume the body is JSON.
  const payload: unknown = await response.json().catch(() => null);

  // UA-9: an expired access token gets one refresh and one retry before the
  // session is treated as over.
  if (response.status === 401 && token && !retried && !SESSIONLESS.has(path) && (await refreshSession())) {
    return request<T>(path, options, true);
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : "Something went wrong. Try again.";

    if (
      typeof window !== "undefined" &&
      token &&
      !SESSIONLESS.has(path) &&
      (response.status === 401 || (response.status === 403 && message.toLowerCase().includes("deactivated")))
    ) {
      window.dispatchEvent(new CustomEvent("kamoti:auth-expired", { detail: { status: response.status, message } }));
    }

    const details = payload && typeof payload === "object" && "details" in payload ? payload.details : undefined;
    const error = new ApiError(response.status, message, details, submissionRetry(response, details));
    if (typeof window !== "undefined" && response.status === 403 && error.code === "residency_required") {
      window.dispatchEvent(new CustomEvent(RESIDENCY_REQUIRED_EVENT));
    }
    throw error;
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData, method = "POST") => request<T>(path, { method, formData }),
};
