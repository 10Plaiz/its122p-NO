import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { pageFields, searchFields, searchFilter, sortColumn } from "../../src/server/lib/query.js";

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

describe("SQLI-03 sort parameter allowlist rejects arbitrary column injection", () => {
  const schema = z.object({ sort: searchFields.sort });

  test("maps approved sort options to exact database columns", () => {
    expect(sortColumn("newest")).toEqual({ column: "submitted_at", ascending: false });
    expect(sortColumn("oldest")).toEqual({ column: "submitted_at", ascending: true });
    expect(sortColumn("status")).toEqual({ column: "status", ascending: true });
  });

  const MALICIOUS_SORTS = [
    "submitted_at; DROP TABLE reports; --",
    "id, password",
    "' OR 1=1 --",
    "status DESC",
    "created_at",
  ];

  for (const sortValue of MALICIOUS_SORTS) {
    test(`rejects unapproved sort value: ${JSON.stringify(sortValue)}`, () => {
      const result = schema.safeParse({ sort: sortValue });
      expect(result.success).toBe(false);
    });
  }
});

describe("SQLI-04 date filter fields enforce ISO date grammar", () => {
  const schema = z.object({
    from: searchFields.from,
    to: searchFields.to,
  });

  test("accepts valid ISO date strings", () => {
    const result = schema.safeParse({ from: "2026-09-01", to: "2026-09-21" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ from: "2026-09-01", to: "2026-09-21" });
  });

  const MALICIOUS_DATES = [
    "' OR '1'='1",
    "2026-09-01' UNION SELECT 1, 2, 3 --",
    "2026-09-01; DROP TABLE reports;",
    "invalid-date-format",
    "09/21/2026",
  ];

  for (const dateVal of MALICIOUS_DATES) {
    test(`rejects non-ISO date payload in from: ${JSON.stringify(dateVal)}`, () => {
      const result = schema.safeParse({ from: dateVal });
      expect(result.success).toBe(false);
    });

    test(`rejects non-ISO date payload in to: ${JSON.stringify(dateVal)}`, () => {
      const result = schema.safeParse({ to: dateVal });
      expect(result.success).toBe(false);
    });
  }
});

describe("SQLI-05 pagination parameter enforcement", () => {
  const schema = z.object(pageFields(20, 50));

  test("accepts valid page numbers and limits", () => {
    const result = schema.safeParse({ page: 2, per_page: 30 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ page: 2, per_page: 30 });
  });

  test("rejects negative or zero page values", () => {
    expect(schema.safeParse({ page: 0 }).success).toBe(false);
    expect(schema.safeParse({ page: -5 }).success).toBe(false);
  });

  test("rejects per_page exceeding maximum limit", () => {
    expect(schema.safeParse({ per_page: 51 }).success).toBe(false);
    expect(schema.safeParse({ per_page: 9999 }).success).toBe(false);
  });

  test("rejects SQL injection payloads in page parameter", () => {
    expect(schema.safeParse({ page: "1; DROP TABLE reports;" }).success).toBe(false);
    expect(schema.safeParse({ per_page: "20 OR 1=1" }).success).toBe(false);
  });
});
