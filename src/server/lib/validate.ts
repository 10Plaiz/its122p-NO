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

// A person's name: letters in any language (so ñ and é pass), plus the spaces,
// periods, apostrophes, and hyphens real names use ("Ma. Dela Cruz-Santos",
// "O'Brien"), with at least two letters. Mirrored by NAME_PATTERN in
// src/web/lib/names.ts, message for message. Length is left to each schema.
export const NAME_PATTERN = /^(?=(?:.*\p{L}){2})[\p{L}\p{M} .'’-]+$/u;
export const NAME_ERROR = "Use letters, spaces, periods, apostrophes, or hyphens only.";

// Supabase stores phone numbers in international form, while every screen and the
// profiles table use the local 09XXXXXXXXX form the contact rule above accepts.
// These convert at that one boundary and nowhere else.
export function toInternationalPhone(local: string): string {
  return `+63${local.slice(1)}`;
}

export function toLocalPhone(international: string): string {
  const digits = international.replace(/\D/g, "");
  return digits.startsWith("63") ? `0${digits.slice(2)}` : digits;
}

// Multipart forms send an untouched optional field as "", which should mean
// "not given" rather than fail the field's own rule.
export function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional());
}

// The parts of a name, each held to NAME_PATTERN. A middle name is the full
// surname a Filipino form asks for, so an initial ("D.") is turned away by the
// two-letter rule with a message that says why. Suffixes are a fixed list: free
// text there only ever produced spellings of the same five words. Mirrored by
// src/web/lib/names.ts, message for message.
export const NAME_PART_MAX = 50;
export const NAME_PART_MAX_ERROR = "Keep each part of the name under 50 characters.";
export const FIRST_NAME_ERROR = "Enter the first name.";
export const LAST_NAME_ERROR = "Enter the last name.";
export const MIDDLE_NAME_ERROR = "Enter the full middle name, not an initial.";
export const SUFFIXES = ["Jr.", "Sr.", "II", "III", "IV", "V"] as const;
export const SUFFIX_ERROR = "Choose a suffix from the list, or leave it blank.";

function namePart(tooShort: string) {
  return z.string().trim().min(2, tooShort).max(NAME_PART_MAX, NAME_PART_MAX_ERROR).regex(NAME_PATTERN, NAME_ERROR);
}

// "D" or "D." on its own: an initial. Checked before the general pattern so the
// person is told what is wanted, not only that the characters are wrong.
export const INITIAL_PATTERN = /^\p{L}\.?$/u;

export const nameParts = {
  first_name: namePart(FIRST_NAME_ERROR),
  middle_name: optional(
    z
      .string()
      .trim()
      .refine((value) => !INITIAL_PATTERN.test(value), MIDDLE_NAME_ERROR)
      .pipe(namePart(MIDDLE_NAME_ERROR)),
  ),
  last_name: namePart(LAST_NAME_ERROR),
  suffix: optional(z.enum(SUFFIXES, SUFFIX_ERROR)),
};

// profiles.name stays the one display name every existing screen reads, so the
// server writes it from the parts rather than trusting a caller to.
type NameParts = { first_name: string; middle_name?: string | null; last_name: string; suffix?: string | null };
export function composeName({ first_name, middle_name, last_name, suffix }: NameParts): string {
  return [first_name, middle_name, last_name, suffix].filter(Boolean).join(" ");
}

// Makati's 23 barangays after the 2023 transfer of the ten EMBO barangays to
// Taguig (PSA PSGC, City of Makati, 1380300000; DILG order of November 2023). The
// migration's profiles_barangay_makati check holds the same list. Mirrored by
// src/web/lib/barangays.ts.
export const BARANGAYS = [
  "Bangkal",
  "Bel-Air",
  "Carmona",
  "Dasmariñas",
  "Forbes Park",
  "Guadalupe Nuevo",
  "Guadalupe Viejo",
  "Kasilawan",
  "La Paz",
  "Magallanes",
  "Olympia",
  "Palanan",
  "Pinagkaisahan",
  "Pio del Pilar",
  "Poblacion",
  "San Antonio",
  "San Isidro",
  "San Lorenzo",
  "Santa Cruz",
  "Singkamas",
  "Tejeros",
  "Urdaneta",
  "Valenzuela",
] as const;
export const BARANGAY_ERROR = "Choose your barangay in Makati.";
export const barangay = z.enum(BARANGAYS, BARANGAY_ERROR);

export const ADDRESS_MIN_ERROR = "Enter your house number and street.";
export const ADDRESS_MAX_ERROR = "Keep the address under 200 characters.";
export const addressLine = z.string().trim().min(5, ADDRESS_MIN_ERROR).max(200, ADDRESS_MAX_ERROR);

// Supabase sends six digits for both the email and the phone code (otp_length in
// config.toml).
export const CODE_ERROR = "Enter the 6-digit code.";
export const verificationCode = z.string().trim().regex(/^\d{6}$/, CODE_ERROR);

export const PASSWORD_MIN_ERROR = "Use at least 8 characters.";
export const PASSWORD_MAX_ERROR = "Keep the password under 72 characters.";
export const PASSWORD_LETTER_ERROR = "Include at least one letter (A–Z).";
export const PASSWORD_DIGIT_ERROR = "Include at least one number (0–9).";
export const PASSWORD_SPECIAL_ERROR = "Include at least one special character, such as ! or #.";

// 72 is where bcrypt stops reading, so anything past it is not actually part of
// the password hash. Every check runs, so a weak password hears everything it is
// missing at once rather than one complaint per submit. Mirrored by
// PASSWORD_RULES in src/web/lib/passwords.ts, message for message.
//
// Letters and digits are ASCII on purpose: config.toml sets Supabase's own
// `letters_digits` requirement, which checks a-z and 0-9, and a password this rule
// passes must never be one Supabase then rejects. Anything that is not an ASCII
// letter or digit counts as special, so ñ, é, and a space all qualify.
export const passwordRule = z
  .string()
  .min(8, PASSWORD_MIN_ERROR)
  .max(72, PASSWORD_MAX_ERROR)
  .regex(/[A-Za-z]/, PASSWORD_LETTER_ERROR)
  .regex(/[0-9]/, PASSWORD_DIGIT_ERROR)
  .regex(/[^A-Za-z0-9]/, PASSWORD_SPECIAL_ERROR);

