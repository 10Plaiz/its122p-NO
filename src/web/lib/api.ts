// The one place the browser talks to the API. Every screen goes through here, so
// the token header, the error shape and the query encoding are defined once.
//
// Vite proxies /api to the Express server on :4000 in development; in production
// Vercel rewrites the same path to the Node function. Relative URLs work in both.

const TOKEN_KEY = "kamoti.token";

// The server's error shape, from src/server/middleware/error.ts.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
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

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // A session that cannot be persisted still works until the tab closes.
  }
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "Something went wrong. Try again.";

    if (
      typeof window !== "undefined" &&
      token &&
      path !== "/auth/login" &&
      (response.status === 401 || (response.status === 403 && message.toLowerCase().includes("deactivated")))
    ) {
      window.dispatchEvent(new CustomEvent("kamoti:auth-expired", { detail: { status: response.status, message } }));
    }

    throw new ApiError(response.status, message, (payload as { details?: unknown } | null)?.details);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData, method = "POST") => request<T>(path, { method, formData }),
};
