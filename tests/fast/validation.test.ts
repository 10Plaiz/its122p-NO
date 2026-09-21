import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { ApiError } from "../../src/server/lib/errors.js";
import { contactNumber, parse } from "../../src/server/lib/validate.js";
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
