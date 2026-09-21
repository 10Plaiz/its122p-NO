import { describe, expect, test } from "bun:test";
import { searchFilter } from "../../src/server/lib/query.js";

// Section B cases. This stack reaches PostgreSQL through PostgREST, so the query
// text a search term could bend is the PostgREST filter grammar rather than raw
// SQL. A term must always end up as a value inside two ilike clauses and never as
// grammar of its own.
const INJECTION_TERMS = [
  { term: "pothole", note: "an ordinary keyword" },
  { term: "title.ilike.%a%,status.eq.resolved", note: "an extra filter clause" },
  { term: "or(status.eq.resolved,status.eq.closed)", note: "a nested or() group" },
  { term: "' OR '1'='1", note: "the classic SQL payload" },
  { term: "'; DROP TABLE reports; --", note: "a statement terminator" },
];

describe("SQLI-01 a search term cannot add or change a filter", () => {
  for (const { term, note } of INJECTION_TERMS) {
    test(`keeps ${note} inside the two ilike clauses`, () => {
      const filter = searchFilter(term);
      expect(filter).not.toBeNull();

      const clauses = filter!.split(",");
      expect(clauses).toHaveLength(2);
      expect(clauses[0]).toStartWith("title.ilike.%");
      expect(clauses[1]).toStartWith("description.ilike.%");
    });
  }

  test("strips the characters PostgREST reads as grammar", () => {
    const filter = searchFilter("or(status.eq.resolved)") ?? "";
    const values = filter.split(",").map((clause) => clause.replace(/^\w+\.ilike\.%|%$/g, ""));

    for (const value of values) {
      expect(value).toBe("or status eq resolved");
    }
  });
});

describe("SQLI-02 a term with nothing left to match is skipped", () => {
  // Returning an empty filter instead of null would search for "%%" and quietly
  // match every report, which reads as a working search that ignores the box.
  for (const term of ["%", "***", "'\"", " ,.() ", "  "]) {
    test(`returns null for ${JSON.stringify(term)}`, () => {
      expect(searchFilter(term)).toBeNull();
    });
  }
});
