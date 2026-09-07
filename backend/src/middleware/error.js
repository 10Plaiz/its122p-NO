import { ApiError } from "../lib/errors.js";
import { MulterError } from "multer";

export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, `No route for ${req.method} ${req.originalUrl}.`));
}

// Express 5 forwards rejected promises from async handlers here automatically,
// so route handlers do not need try/catch.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof MulterError) {
    return res.status(400).json({ error: "That file could not be uploaded.", details: err.message });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong on our end. Try again." });
}
