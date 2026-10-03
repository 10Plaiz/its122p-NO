process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "test-secret-key";

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { ApiError } from "../../src/server/lib/errors.js";
import {
  BARANGAYS as SERVER_BARANGAYS,
  PASSWORD_DIGIT_ERROR,
  PASSWORD_LETTER_ERROR,
  PASSWORD_MAX_ERROR,
  PASSWORD_MIN_ERROR,
  PASSWORD_SPECIAL_ERROR,
  composeName,
  contactNumber,
  parse,
  passwordRule,
} from "../../src/server/lib/validate.js";
import { BARANGAYS as WEB_BARANGAYS } from "../../src/web/lib/barangays.js";
import { validateNameParts } from "../../src/web/lib/names.js";
import { validatePassword as validateWebPassword } from "../../src/web/lib/passwords.js";
import { registerSchema } from "../../src/server/routes/auth.routes.js";
import {
  createSchema as reportCreateSchema,
  editSchema as reportEditSchema,
} from "../../src/server/routes/reports.routes.js";
import { categorySchema } from "../../src/server/routes/categories.routes.js";
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

// UA-4: 8 to 72 characters with a letter, a number, and a special character.
const PASSWORD_INPUTS = [
  { value: "abcdef1!", valid: true, note: "minimum length of 8 characters" },
  { value: `a1!${"a".repeat(69)}`, valid: true, note: "maximum length of 72 characters" },
  { value: "correct-horse-battery-staple-9", valid: true, note: "typical passphrase" },
  { value: "Peñafl0r ok", valid: true, note: "an accented letter or a space counts as special" },
  { value: "Abc1!", valid: false, expectedMessage: PASSWORD_MIN_ERROR, note: "5 characters is too short" },
  { value: "", valid: false, expectedMessage: PASSWORD_MIN_ERROR, note: "empty string is too short" },
  { value: `a1!${"a".repeat(70)}`, valid: false, expectedMessage: PASSWORD_MAX_ERROR, note: "73 characters is too long" },
  { value: "12345678!", valid: false, expectedMessage: PASSWORD_LETTER_ERROR, note: "no letter" },
  { value: "abcdefgh!", valid: false, expectedMessage: PASSWORD_DIGIT_ERROR, note: "no number" },
  { value: "abcdefg1", valid: false, expectedMessage: PASSWORD_SPECIAL_ERROR, note: "no special character" },
];

// The real browser rule, so this compares the two sides rather than a copy.
const validateClientPassword = validateWebPassword;

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

describe("VAL-06 report submission validation schema", () => {
  const validReport = {
    title: "Large pothole on highway",
    description: "Deep pothole damaging front tires near the intersection.",
    category_id: 1,
    primary_problem_id: 1,
    latitude: 14.5547,
    longitude: 121.0244,
    address_text: "Sample Avenue corner Main St",
  };

  test("accepts completely valid report input", () => {
    const result = reportCreateSchema.safeParse(validReport);
    expect(result.success).toBe(true);
  });

  test("rejects title shorter than 3 characters", () => {
    const result = reportCreateSchema.safeParse({ ...validReport, title: "ab" });
    expect(result.success).toBe(false);
  });

  test("rejects title exceeding 150 characters", () => {
    const result = reportCreateSchema.safeParse({ ...validReport, title: "a".repeat(151) });
    expect(result.success).toBe(false);
  });

  test("rejects description shorter than 10 characters with helpful message", () => {
    const result = reportCreateSchema.safeParse({ ...validReport, description: "too short" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Describe the problem in at least 10 characters.");
  });

  test("rejects description exceeding 1000 characters with helpful message", () => {
    const result = reportCreateSchema.safeParse({ ...validReport, description: "a".repeat(1001) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Keep the description under 1000 characters.");
  });

  test("rejects invalid latitude bounds (< -90 or > 90)", () => {
    expect(reportCreateSchema.safeParse({ ...validReport, latitude: 90.1 }).success).toBe(false);
    expect(reportCreateSchema.safeParse({ ...validReport, latitude: -90.1 }).success).toBe(false);
  });

  test("rejects invalid longitude bounds (< -180 or > 180)", () => {
    expect(reportCreateSchema.safeParse({ ...validReport, longitude: 180.1 }).success).toBe(false);
    expect(reportCreateSchema.safeParse({ ...validReport, longitude: -180.1 }).success).toBe(false);
  });

  test("rejects negative or non-integer category_id", () => {
    expect(reportCreateSchema.safeParse({ ...validReport, category_id: -1 }).success).toBe(false);
    expect(reportCreateSchema.safeParse({ ...validReport, category_id: 0 }).success).toBe(false);
    expect(reportCreateSchema.safeParse({ ...validReport, category_id: 1.5 }).success).toBe(false);
  });
});

describe("VAL-07 user registration validation schema", () => {
  const validRegistration = {
    first_name: "Maria",
    last_name: "Santos",
    email: "maria.santos@example.com",
    password: "StrongPassword123!",
    contact_number: "09181234567",
    barangay: "Poblacion",
    address_line: "123 J.P. Rizal Street",
    privacy_consent: true,
  };

  test("accepts valid registration input", () => {
    const result = registerSchema.safeParse(validRegistration);
    expect(result.success).toBe(true);
  });

  test("rejects a first name shorter than 2 characters", () => {
    const result = registerSchema.safeParse({ ...validRegistration, first_name: "M" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter the first name.");
  });

  test("rejects a middle initial but allows no middle name (UA-7)", () => {
    const initial = registerSchema.safeParse({ ...validRegistration, middle_name: "D." });
    expect(initial.success).toBe(false);
    expect(initial.error?.issues[0]?.message).toBe("Enter the full middle name, not an initial.");
    expect(registerSchema.safeParse({ ...validRegistration, middle_name: "" }).success).toBe(true);
    expect(registerSchema.safeParse({ ...validRegistration, middle_name: "Dela Cruz" }).success).toBe(true);
  });

  test("rejects names made of symbols or digits", () => {
    for (const last_name of ["!@#$%^&*()_+", "J@ne!!", "Agent 007", ".."]) {
      const result = registerSchema.safeParse({ ...validRegistration, last_name });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        "Use letters, spaces, periods, apostrophes, or hyphens only.",
      );
    }
  });

  test("accepts real names with accents, periods, apostrophes, and hyphens", () => {
    for (const last_name of ["Dela Cruz-Santos", "O'Brien", "Niño"]) {
      expect(registerSchema.safeParse({ ...validRegistration, last_name }).success).toBe(true);
    }
  });

  test("accepts only a listed suffix", () => {
    expect(registerSchema.safeParse({ ...validRegistration, suffix: "Jr." }).success).toBe(true);
    expect(registerSchema.safeParse({ ...validRegistration, suffix: "Esq." }).success).toBe(false);
  });

  test("needs a Makati barangay, a street address, and privacy consent (UA-7, UA-8)", () => {
    const pembo = registerSchema.safeParse({ ...validRegistration, barangay: "Pembo" });
    expect(pembo.success).toBe(false);
    expect(pembo.error?.issues[0]?.message).toBe("Choose your barangay in Makati.");
    expect(registerSchema.safeParse({ ...validRegistration, address_line: "abc" }).success).toBe(false);
    const noConsent = registerSchema.safeParse({ ...validRegistration, privacy_consent: false });
    expect(noConsent.error?.issues[0]?.message).toBe("Agree to the privacy notice to create an account.");
  });

  test("web and server agree on the barangay list and the name messages", () => {
    expect([...WEB_BARANGAYS]).toEqual([...SERVER_BARANGAYS]);
    expect(WEB_BARANGAYS).toHaveLength(23);
    expect(validateNameParts({ first: "M", middle: "D.", last: "", suffix: "" })).toEqual({
      first_name: "Enter the first name.",
      middle_name: "Enter the full middle name, not an initial.",
      last_name: "Enter the last name.",
    });
  });

  test("composes the display name from its parts", () => {
    expect(composeName({ first_name: "Juan", middle_name: "Dela Cruz", last_name: "Santos", suffix: "Jr." })).toBe(
      "Juan Dela Cruz Santos Jr.",
    );
    expect(composeName({ first_name: "Maria", last_name: "Santos" })).toBe("Maria Santos");
  });

  test("rejects invalid email formats", () => {
    for (const invalidEmail of ["notanemail", "user@", "@domain.com", "user@domain"]) {
      const result = registerSchema.safeParse({ ...validRegistration, email: invalidEmail });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Enter a valid email address.");
    }
  });

  test("rejects password violating length constraints", () => {
    expect(registerSchema.safeParse({ ...validRegistration, password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegistration, password: "a".repeat(73) }).success).toBe(false);
  });
});

describe("VAL-08 report edit schema validation", () => {
  test("accepts single field update", () => {
    const result = reportEditSchema.safeParse({ title: "Updated report title" });
    expect(result.success).toBe(true);
  });

  test("rejects empty edit payload", () => {
    const result = reportEditSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Send at least one field to change.");
  });
});

describe("VAL-09 category management validation schema", () => {
  test("accepts valid category input", () => {
    const result = categorySchema.safeParse({
      name: "Traffic Lights",
      description: "Non-functional or damaged traffic control signals.",
      is_active: true,
    });
    expect(result.success).toBe(true);
  });

  test("rejects category name shorter than 2 characters", () => {
    const result = categorySchema.safeParse({ name: "A" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a category name.");
  });

  test("rejects description exceeding 300 characters", () => {
    const result = categorySchema.safeParse({
      name: "Road Hazards",
      description: "a".repeat(301),
    });
    expect(result.success).toBe(false);
  });
});
