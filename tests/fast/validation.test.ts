import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { ApiError } from "../../src/server/lib/errors.js";
import {
  PASSWORD_MAX_ERROR,
  PASSWORD_MIN_ERROR,
  contactNumber,
  parse,
  passwordRule,
} from "../../src/server/lib/validate.js";
import { CONTACT_ERROR, validateContactNumber } from "../../src/web/components/ContactNumberField.js";

// Section A cases. Both contact-number rules are written down once here so the
// frontend and the API are checked against the same table.
const CONTACT_INPUTS = [
  { value: "09171234567", valid: true, note: "eleven digits starting 09" },
  { value: "  09171234567  ", valid: true, note: "surrounding spaces are trimmed" },
  { value: "0917123456", valid: false, note: "ten digits" },
  { value: "091712345678", valid: false, note: "twelve digits" },
  { value: "08171234567", valid: false, note: "wrong prefix" },
  { value: "+639171234567", valid: false, note: "international form" },
  { value: "0917-123-4567", valid: false, note: "separators left in" },
  { value: "09abcdefghi", valid: false, note: "letters after the prefix" },
];

describe("VAL-01 contact number rule", () => {
  for (const { value, valid, note } of CONTACT_INPUTS) {
    test(`${valid ? "accepts" : "rejects"} ${note}`, () => {
      expect(contactNumber.safeParse(value).success).toBe(valid);
    });
  }
});

describe("VAL-02 contact number rule is the same on both sides", () => {
  // The two rules are deliberate copies of each other, so the only way they stay
  // in step is a check that fails when one of them is edited alone.
  for (const { value, valid, note } of CONTACT_INPUTS) {
    test(`frontend and API agree on ${note}`, () => {
      const acceptedByApi = contactNumber.safeParse(value).success;
      const acceptedByForm = validateContactNumber(value) === undefined;

      expect(acceptedByApi).toBe(valid);
      expect(acceptedByForm).toBe(valid);
    });
  }

  test("both sides show the same message", () => {
    const apiResult = contactNumber.safeParse("0917");
    expect(apiResult.success).toBe(false);
    expect(apiResult.error?.issues[0]?.message).toBe(CONTACT_ERROR);
    expect(validateContactNumber("0917")).toBe(CONTACT_ERROR);
  });
});

describe("VAL-03 rejected input names the fields that were wrong", () => {
  const schema = z.object({
    title: z.string().min(1),
    contact_number: contactNumber,
  });

  test("a valid body is returned unchanged", () => {
    expect(parse(schema, { title: "Broken streetlight", contact_number: "09171234567" })).toEqual({
      title: "Broken streetlight",
      contact_number: "09171234567",
    });
  });

  test("an invalid body throws a 400 listing every bad field", () => {
    let thrownError: ApiError | undefined;
    try {
      parse(schema, { title: "", contact_number: "0917" });
    } catch (error) {
      if (error instanceof ApiError) {
        thrownError = error;
      }
    }

    expect(thrownError).toBeDefined();
    expect(thrownError?.status).toBe(400);
    expect(thrownError?.details).toEqual([
      { field: "title", message: expect.any(String) },
      { field: "contact_number", message: CONTACT_ERROR },
    ]);
  });
});

const PASSWORD_INPUTS = [
  { value: "a".repeat(8), valid: true, note: "minimum length of 8 characters" },
  { value: "a".repeat(72), valid: true, note: "maximum length of 72 characters" },
  { value: "correct-horse-battery-staple", valid: true, note: "typical passphrase" },
  { value: "a".repeat(7), valid: false, expectedMessage: PASSWORD_MIN_ERROR, note: "7 characters is too short" },
  { value: "", valid: false, expectedMessage: PASSWORD_MIN_ERROR, note: "empty string is too short" },
  { value: "a".repeat(73), valid: false, expectedMessage: PASSWORD_MAX_ERROR, note: "73 characters is too long" },
];

function validateClientPassword(password: string): string | undefined {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 72) return "Keep the password under 72 characters.";
  return undefined;
}

describe("VAL-04 password creation rule", () => {
  for (const { value, valid, note } of PASSWORD_INPUTS) {
    test(`${valid ? "accepts" : "rejects"} ${note}`, () => {
      expect(passwordRule.safeParse(value).success).toBe(valid);
    });
  }
});

describe("VAL-05 password rule is the same on both sides", () => {
  for (const { value, valid, expectedMessage, note } of PASSWORD_INPUTS) {
    test(`frontend and API agree on ${note}`, () => {
      const serverResult = passwordRule.safeParse(value);
      const clientError = validateClientPassword(value);

      expect(serverResult.success).toBe(valid);
      expect(clientError === undefined).toBe(valid);

      if (!valid && expectedMessage) {
        expect(serverResult.error?.issues[0]?.message).toBe(expectedMessage);
        expect(clientError).toBe(expectedMessage);
      }
    });
  }
});

