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

// The parts of a name (UA-7). Mirrored by nameParts in src/server/lib/validate.ts,
// message for message. A middle name is the full surname a Filipino form asks for,
// so an initial is turned away by the two-letter rule with a message that says why.
export const NAME_PART_MAX = 50;
export const NAME_PART_MAX_ERROR = "Keep each part of the name under 50 characters.";
export const FIRST_NAME_ERROR = "Enter the first name.";
export const LAST_NAME_ERROR = "Enter the last name.";
export const MIDDLE_NAME_ERROR = "Enter the full middle name, not an initial.";
export const SUFFIXES = ["Jr.", "Sr.", "II", "III", "IV", "V"] as const;

// "D" or "D." on its own. Mirrors INITIAL_PATTERN on the server.
const INITIAL_PATTERN = /^\p{L}\.?$/u;

export function validateNamePart(
  value: string,
  tooShort: string,
  { optional = false, noInitial = false } = {},
): string | undefined {
  const part = value.trim();
  if (optional && part === "") return undefined;
  if (noInitial && INITIAL_PATTERN.test(part)) return tooShort;
  if (part.length > NAME_PART_MAX) return NAME_PART_MAX_ERROR;
  return validateName(part, tooShort);
}

export type NameValues = { first: string; middle: string; last: string; suffix: string };

// Keys are the API's field names, so a server field error lands on the same input.
export function validateNameParts(values: NameValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const first = validateNamePart(values.first, FIRST_NAME_ERROR);
  const middle = validateNamePart(values.middle, MIDDLE_NAME_ERROR, { optional: true, noInitial: true });
  const last = validateNamePart(values.last, LAST_NAME_ERROR);
  if (first) errors.first_name = first;
  if (middle) errors.middle_name = middle;
  if (last) errors.last_name = last;
  return errors;
}
