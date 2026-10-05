import { ApiError } from "../lib/errors.js";
import { MulterError } from "multer";
import type { Request, Response, NextFunction } from "express";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, `No route for ${req.method} ${req.originalUrl}.`));
}

// Express 5 forwards rejected promises from async handlers here automatically,
// so route handlers do not need try/catch.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof MulterError) {
    return res.status(400).json({ error: "That file could not be uploaded.", details: err.message });
  }

  if (err instanceof ApiError) {
    if (err.retryAfterSeconds !== undefined) res.set("Retry-After", String(err.retryAfterSeconds));
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong on our end. Try again." });
}
