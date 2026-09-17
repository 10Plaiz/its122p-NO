import { badRequest } from "./errors.js";
import type { z } from "zod";

// Parses `source` against a zod schema and returns the clean value.
// Rejects with a 400 listing which fields were wrong.
export function parse<T extends z.ZodType>(schema: T, source: unknown): z.output<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(body)",
      message: issue.message,
    }));
    throw badRequest("Some fields are invalid. Fix them and try again.", details);
  }
  return result.data;
}
