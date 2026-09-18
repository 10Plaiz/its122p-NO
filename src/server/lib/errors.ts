// One error type for everything the API deliberately rejects.
// Anything else that throws is a bug and becomes a 500.
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, message, details);
export const unauthorized = (message = "You are not signed in.") => new ApiError(401, message);
export const forbidden = (message = "You do not have access to this.") => new ApiError(403, message);
export const notFound = (message = "Not found.") => new ApiError(404, message);

// Supabase returns errors instead of throwing. This turns one into a 500 so a
// failed query can never be mistaken for an empty result.
export function orThrow<T>({ data, error }: { data: T; error: { message: string } | null }, message: string): NonNullable<T> {
  if (error) throw new ApiError(500, message, error.message);
  if (data == null) throw new ApiError(500, message);
  return data;
}

// For writes that deliberately return no rows. supabase-js answers a bare insert or
// update with data: null even when it succeeded, so orThrow would treat every one of
// them as a failure and report a 500 over a write that actually landed. Only the
// error means anything here.
export function throwIfFailed({ error }: { error: { message: string } | null }, message: string) {
  if (error) throw new ApiError(500, message, error.message);
}
