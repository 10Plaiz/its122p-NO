import { badRequest } from "./errors.js";
import { z } from "zod";

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

// A Philippine mobile number: exactly eleven digits beginning 09. Mirrored by
// CONTACT_PATTERN in src/web/components/ContactNumberField.tsx, message for
// message. It is shared from here because three routes accept the same field, and
// a rule kept in one of them drifts out of step with the other two.
//
// The form strips non-digits before sending, so anything reaching this check came
// from a caller that skipped the form — which is exactly the case it exists for.
export const contactNumber = z
  .string()
  .trim()
  .regex(/^09\d{9}$/, "Enter an 11-digit mobile number starting with 09.");

export const PASSWORD_MIN_ERROR = "Use at least 8 characters.";
export const PASSWORD_MAX_ERROR = "Keep the password under 72 characters.";

// 72 is where bcrypt stops reading, so anything past it is not actually part of
// the password hash.
export const passwordRule = z
  .string()
  .min(8, PASSWORD_MIN_ERROR)
  .max(72, PASSWORD_MAX_ERROR);

