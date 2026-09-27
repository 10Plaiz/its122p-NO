import { describe, expect, test } from "bun:test";
import { fieldNoteId, filterLeftErrors } from "../../src/web/components/ui.js";

describe("fieldNoteId helper", () => {
  test("generates note identifier matching the control htmlFor convention", () => {
    expect(fieldNoteId("email")).toBe("email-note");
    expect(fieldNoteId("edit-title")).toBe("edit-title-note");
    expect(fieldNoteId("cat-name")).toBe("cat-name-note");
  });
});

describe("filterLeftErrors validation helper (KR-07, KR-08)", () => {
  test("returns empty errors when no controls have been left", () => {
    const errors = { name: "Enter full name.", email: "Enter valid email." };
    const left = new Set<string>();

    const visible = filterLeftErrors(errors, left);
    expect(visible).toEqual({});
  });

  test("includes errors only for controls present in the left set", () => {
    const errors = { name: "Enter full name.", email: "Enter valid email." };
    const left = new Set(["name"]);

    const visible = filterLeftErrors(errors, left);
    expect(visible).toEqual({ name: "Enter full name." });
  });

  test("resolves custom control IDs mapped via the ids parameter", () => {
    const errors = {
      contact_number: "Enter an eleven digit number.",
      name: "Enter full name.",
    };
    // The control rendered on screen uses id="contact", differing from error key "contact_number"
    const left = new Set(["contact"]);
    const idMap = { contact_number: "contact" };

    const visible = filterLeftErrors(errors, left, idMap);
    expect(visible).toEqual({ contact_number: "Enter an eleven digit number." });
  });

  test("ignores mapped error keys when the mapped control has not been left", () => {
    const errors = {
      contact_number: "Enter an eleven digit number.",
      name: "Enter full name.",
    };
    const left = new Set(["name"]);
    const idMap = { contact_number: "contact" };

    const visible = filterLeftErrors(errors, left, idMap);
    expect(visible).toEqual({ name: "Enter full name." });
  });

  test("handles empty error records gracefully", () => {
    const errors = {};
    const left = new Set(["name", "email"]);

    const visible = filterLeftErrors(errors, left);
    expect(visible).toEqual({});
  });
});
