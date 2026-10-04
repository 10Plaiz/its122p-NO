import { ApiError } from "./errors.js";

// PostgREST preserves the deliberate PTxxx errors raised by our write functions.
// An unexpected database failure stays a 500; it must not look like an empty row.
export function rpcData({ data, error }: {
  data: unknown;
  error: { code: string; message: string } | null;
}, failure: string): unknown {
  if (error) {
    const statuses: Record<string, number | undefined> = { PT400: 400, PT403: 403, PT404: 404, PT409: 409 };
    const status = statuses[error.code];
    throw new ApiError(status ?? 500, status ? error.message : failure);
  }
  return data;
}
