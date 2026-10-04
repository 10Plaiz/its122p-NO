process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, it } from "bun:test";

// Report submission (RS-1 to RS-5, and the citizen's cancel reason from SW-2).
// No live database: these cover the pure rules the routes and forms share.

const server = await import("../../src/server/services/reports.submission.js");
const routes = await import("../../src/server/routes/reports.submission.routes.js");
const rules = await import("../../src/web/lib/report-rules.js");
const { appendTranscript } = await import("../../src/web/components/VoiceInput.js");

const valid = {
  title: "Pothole on Ayala Avenue",
  description: "A deep pothole in the right lane near the corner.",
  category_id: 1,
  latitude: 14.5547,
  longitude: 121.0244,
  primary_problem_id: 1,
};

describe("SUB-01 problem types on a new report (RS-4)", () => {
  it("requires a main problem", () => {
    const { primary_problem_id: _omit, ...withoutPrimary } = valid;
    const result = routes.createSchema.safeParse(withoutPrimary);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(routes.PRIMARY_PROBLEM_ERROR);
  });

  it("accepts an optional other problem, but never the main one twice", () => {
    expect(routes.createSchema.safeParse({ ...valid, secondary_problem_id: 2 }).success).toBe(true);
    const same = routes.createSchema.safeParse({ ...valid, secondary_problem_id: 1 });
    expect(same.success).toBe(false);
    expect(same.error?.issues[0]?.message).toBe(server.PROBLEMS_DIFFER);
  });

  it("refuses a problem that is missing, retired, or from another category (RS-2)", () => {
    const rows = [
      { id: 1, category_id: 1, is_active: true },
      { id: 2, category_id: 2, is_active: true },
      { id: 3, category_id: 1, is_active: false },
    ];
    expect(server.problemSelectionErrors(rows, 1, { primary_problem_id: 1 })).toEqual([]);
    expect(server.problemSelectionErrors(rows, 1, { primary_problem_id: 2 })[0]?.message).toBe(
      "Choose a problem from the selected category.",
    );
    expect(server.problemSelectionErrors(rows, 1, { primary_problem_id: 3 })[0]?.message).toBe(
      "That problem type has been retired. Choose another.",
    );
    expect(server.problemSelectionErrors(rows, 1, { secondary_problem_id: 9 })[0]).toEqual({
      field: "secondary_problem_id",
      message: "Choose a problem type that exists.",
    });
  });
});

describe("SUB-02 editing problems (RS-3, RS-4)", () => {
  it("needs a new main problem when the category changes", () => {
    const result = routes.editSchema.safeParse({ category_id: 2 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(routes.PRIMARY_PROBLEM_AGAIN_ERROR);
    expect(routes.editSchema.safeParse({ category_id: 2, primary_problem_id: 7 }).success).toBe(true);
  });

  it("clears the old category's other problem unless a new one is sent", () => {
    const current = { primary_problem_id: 1, secondary_problem_id: 2 };
    expect(server.resolveProblemEdit(current, { primary_problem_id: 7 }, true).write).toEqual({
      primary_problem_id: 7,
      secondary_problem_id: null,
    });
    expect(server.resolveProblemEdit(current, { primary_problem_id: 7, secondary_problem_id: 8 }, true).write).toEqual({
      primary_problem_id: 7,
      secondary_problem_id: 8,
    });
  });

  it("refuses an other problem without a main one, or equal to it", () => {
    const legacy = { primary_problem_id: null, secondary_problem_id: null };
    expect(server.resolveProblemEdit(legacy, { secondary_problem_id: 4 }, false).errors[0]?.message).toBe(
      server.SECONDARY_NEEDS_PRIMARY,
    );
    const current = { primary_problem_id: 1, secondary_problem_id: null };
    expect(server.resolveProblemEdit(current, { secondary_problem_id: 1 }, false).errors[0]?.message).toBe(
      server.PROBLEMS_DIFFER,
    );
  });
});

describe("SUB-03 edit history says what changed (RS-3)", () => {
  const before = {
    title: "Pothole",
    description: "A deep pothole.",
    address_text: null,
    latitude: 14.5547,
    longitude: 121.0244,
    category: "Road",
    primary: "Pothole",
    secondary: null,
  };

  it("lists each changed field as old → new and skips unchanged ones", () => {
    const text = server.describeEdit({ before, after: { ...before, title: "Big pothole", secondary: "Cracked pavement" } });
    expect(text).toBe("other problem none → Cracked pavement; title “Pothole” → “Big pothole”");
    expect(server.describeEdit({ before, after: before })).toBe("");
  });

  it("cuts long text so one edit does not bury the history", () => {
    const shown = server.truncateForHistory("x".repeat(200));
    expect(shown.length).toBeLessThanOrEqual(server.HISTORY_TEXT_LIMIT + 2);
    expect(shown.endsWith("…”")).toBe(true);
    expect(server.truncateForHistory("   ")).toBe("none");
  });
});

describe("SUB-04 a withdrawal always says why (SW-2)", () => {
  it("requires a reason on the server and in the dialog, with the same words", () => {
    expect(routes.cancelSchema.safeParse({}).success).toBe(false);
    expect(routes.cancelSchema.safeParse({ details: "   " }).success).toBe(false);
    expect(routes.cancelSchema.safeParse({ details: "Filed by mistake." }).success).toBe(true);

    expect(rules.validateCancelReason("  ")).toBe(routes.CANCEL_REASON_ERROR);
    expect(rules.validateCancelReason("x".repeat(501))).toBe(routes.CANCEL_REASON_MAX_ERROR);
    expect(rules.validateCancelReason("Filed by mistake.")).toBeUndefined();
  });
});

describe("SUB-05 the form mirrors the server, message for message", () => {
  const values = { title: "", description: "", categoryId: "", address: "", primaryId: "", secondaryId: "" };

  it("names the same fields with the same messages as createSchema", () => {
    const errors = rules.validateReportFields(values);
    const server = routes.createSchema.safeParse({ title: "", description: "", latitude: 14.55, longitude: 121.02 });
    const serverMessages = new Map(server.error?.issues.map((issue) => [String(issue.path[0]), issue.message]));

    for (const field of ["title", "description", "category_id", "primary_problem_id"]) {
      expect(serverMessages.get(field)).toBe(errors[field]);
    }
  });

  it("lets a report filed before problem types keep none, unless its category changes", () => {
    expect(rules.validateReportFields(values, null).primary_problem_id).toBeUndefined();
    expect(rules.PRIMARY_PROBLEM_AGAIN_ERROR).toBe(routes.PRIMARY_PROBLEM_AGAIN_ERROR);
    expect(rules.PROBLEMS_DIFFER).toBe(server.PROBLEMS_DIFFER);
  });

  it("offers only the chosen category's problems, without the main one twice (RS-2)", () => {
    const groups = [
      { category_id: 1, problem_types: [{ id: 1, name: "Pothole" }, { id: 2, name: "Cracked pavement" }] },
      { category_id: 2, problem_types: [{ id: 6, name: "Lamp not working" }] },
    ];
    expect(rules.problemOptions(groups, "2").map((problem) => problem.id)).toEqual([6]);
    expect(rules.problemOptions(groups, "1", { exclude: "1" }).map((problem) => problem.id)).toEqual([2]);
    expect(rules.problemOptions(groups, "")).toEqual([]);
    const retired = { id: 9, name: "Retired type" };
    expect(rules.problemOptions(groups, "1", { keep: retired }).map((problem) => problem.id)).toEqual([1, 2, 9]);
  });
});

describe("SUB-06 drafts survive a reload but never a bad value (RS-5)", () => {
  it("keeps only well-formed fields from a stored draft", () => {
    const draft = rules.parseNewReportDraft({
      version: 1,
      step: 7,
      point: { lat: 14.55, lng: 121.02 },
      title: "T".repeat(500),
      description: "Water everywhere.",
      categoryId: "2",
      primaryId: "not-a-number",
      secondaryId: "",
      address: 42,
    });
    expect(draft?.step).toBe(2);
    expect(draft?.point).toEqual({ lat: 14.55, lng: 121.02 });
    expect(draft?.title.length).toBe(rules.TITLE_MAX);
    expect(draft?.primaryId).toBe("");
    expect(draft?.address).toBe("");
  });

  it("rejects other versions and junk", () => {
    expect(rules.parseNewReportDraft({ version: 2 })).toBeNull();
    expect(rules.parseNewReportDraft("text")).toBeNull();
    expect(rules.parseNewReportDraft(null)).toBeNull();
  });

  it("treats a form with nothing typed as empty, so no draft is offered", () => {
    const empty = rules.parseNewReportDraft({ version: 1 });
    expect(empty && rules.isNewReportDraftEmpty(empty)).toBe(true);
  });
});

describe("SUB-07 dictation appends without passing the limit (RS-1)", () => {
  it("adds a space between phrases and trims what was heard", () => {
    expect(appendTranscript("Pothole", "  near the corner ", 100)).toEqual({
      text: "Pothole near the corner",
      truncated: false,
    });
    expect(appendTranscript("", "Flooded", 100).text).toBe("Flooded");
  });

  it("stops at the character limit and says so", () => {
    expect(appendTranscript("12345", "67890", 8)).toEqual({ text: "12345 67", truncated: true });
  });
});
