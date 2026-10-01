// A person's name: letters in any language, plus spaces, periods, apostrophes,
// and hyphens, with at least two letters. Mirrored by NAME_PATTERN in
// src/server/lib/validate.ts, message for message, so a field never says one
// thing here and another after submitting.
export const NAME_PATTERN = /^(?=(?:.*\p{L}){2})[\p{L}\p{M} .'’-]+$/u;
export const NAME_ERROR = "Use letters, spaces, periods, apostrophes, or hyphens only.";

// `tooShort` is each form's own wording for a name under two characters.
export function validateName(value: string, tooShort: string): string | undefined {
  const name = value.trim();
  if (name.length < 2) return tooShort;
  return NAME_PATTERN.test(name) ? undefined : NAME_ERROR;
}
