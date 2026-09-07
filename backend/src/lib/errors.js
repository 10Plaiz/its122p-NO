// One error type for everything the API deliberately rejects.
// Anything else that throws is a bug and becomes a 500.
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, message, details);
export const unauthorized = (message = "You are not signed in.") => new ApiError(401, message);
export const forbidden = (message = "You do not have access to this.") => new ApiError(403, message);
export const notFound = (message = "Not found.") => new ApiError(404, message);

// Supabase returns errors instead of throwing. This turns one into a 500 so a
// failed query can never be mistaken for an empty result.
export function orThrow({ data, error }, message) {
  if (error) throw new ApiError(500, message, error.message);
  return data;
}
