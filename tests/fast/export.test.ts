import { afterEach, describe, expect, test } from "bun:test";
import {
  capNotice,
  csvField,
  describeFilters,
  exportFilename,
  guardFormula,
  tableData,
  toCsv,
} from "../../src/web/lib/export.js";
import type { Column } from "../../src/web/lib/table-types.js";
import { lastPage, pageItems, parsePage, rangeSummary } from "../../src/web/components/data-table/pages.js";
import { readChoices, storageKey, visibleIds } from "../../src/web/components/data-table/useColumnVisibility.js";

// TB-1, TB-2 and TB-4: the pure parts of the data-table kit. No DOM and no DB.

describe("TB-4 CSV formula-injection guard", () => {
  for (const value of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
    test(`prefixes ${JSON.stringify(value.slice(0, 6))} so a spreadsheet reads it as text`, () => {
      expect(guardFormula(value)).toBe(`'${value}`);
    });
  }

  test("leaves ordinary text alone", () => {
    expect(guardFormula("Pothole on Ayala Avenue")).toBe("Pothole on Ayala Avenue");
    expect(guardFormula("KMT-2026-000001")).toBe("KMT-2026-000001");
    expect(guardFormula("")).toBe("");
  });

  test("guards before quoting, so the apostrophe sits inside the quotes", () => {
    expect(csvField('=1,"2"')).toBe(`"'=1,""2"""`);
  });
});

describe("TB-4 CSV is RFC 4180", () => {
  test("quotes fields with commas, quotes and line breaks, doubling inner quotes", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
    expect(csvField("Oct 2, 2026")).toBe('"Oct 2, 2026"');
  });

  test("starts with a UTF-8 BOM and ends every record in CRLF", () => {
    const csv = toCsv(["Reference", "Title"], [["KMT-1", "Peñaflor St, flooded"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe('﻿Reference,Title\r\nKMT-1,"Peñaflor St, flooded"\r\n');
  });

  test("a header-only export is still a valid file", () => {
    expect(toCsv(["A"], [])).toBe("﻿A\r\n");
  });
});

type Row = { ref: string; title: string; secret: string };
const COLUMNS: Column<Row>[] = [
  { id: "ref", header: "Reference", required: true, cell: (row) => row.ref, exportValue: (row) => row.ref },
  { id: "title", header: "Title", cell: (row) => row.title, exportValue: (row) => row.title },
  { id: "secret", header: "Hidden by default", defaultHidden: true, cell: (row) => row.secret, exportValue: (row) => row.secret },
  { id: "actions", header: "Actions", srOnlyHeader: true, required: true, cell: () => null },
];

describe("TB-4 exports hold the visible columns only", () => {
  const rows: Row[] = [{ ref: "KMT-1", title: "Pothole", secret: "x" }];

  test("drops hidden columns and columns with no export text", () => {
    const { headers, body } = tableData(COLUMNS, new Set(["ref", "title", "actions"]), rows);
    expect(headers).toEqual(["Reference", "Title"]);
    expect(body).toEqual([["KMT-1", "Pothole"]]);
  });

  test("follows the person's choice when they hide a column", () => {
    const { headers } = tableData(COLUMNS, new Set(["ref", "actions"]), rows);
    expect(headers).toEqual(["Reference"]);
  });
});

describe("TB-4 filenames, filter lines and the cap notice", () => {
  test("names the file kamoti-<name>-YYYY-MM-DD.<format> in local time", () => {
    const date = new Date(2026, 0, 5, 23, 30);
    expect(exportFilename("reports", "csv", date)).toBe("kamoti-reports-2026-01-05.csv");
    expect(exportFilename("activity-log", "pdf", date)).toBe("kamoti-activity-log-2026-01-05.pdf");
  });

  test("lists only the filters that are set", () => {
    expect(describeFilters([["Status", "Pending"], ["Category", null], ["Search", ""]])).toBe("Filters: Status: Pending");
    expect(describeFilters([["Status", null]])).toStartWith("Filters: none");
  });

  test("says nothing when the export is complete, and names both numbers when it is not", () => {
    expect(capNotice(120, 5000, false)).toBeNull();
    expect(capNotice(7231, 5000, true)).toContain("5,000 of 7,231");
  });
});

describe("TB-1 numbered pagination", () => {
  test("shows short runs in full", () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("uses gaps for long runs, keeping the first, last and current pages", () => {
    expect(pageItems(1, 10)).toEqual([1, 2, 3, 4, 5, "gap", 10]);
    expect(pageItems(6, 10)).toEqual([1, "gap", 5, 6, 7, "gap", 10]);
    expect(pageItems(10, 10)).toEqual([1, "gap", 6, 7, 8, 9, 10]);
    expect(pageItems(50, 100)).toEqual([1, "gap", 49, 50, 51, "gap", 100]);
  });

  test("always contains the current page exactly once", () => {
    for (let page = 1; page <= 30; page += 1) {
      expect(pageItems(page, 30).filter((item) => item === page)).toHaveLength(1);
    }
  });

  test("never has more than seven slots", () => {
    for (let page = 1; page <= 40; page += 1) expect(pageItems(page, 40).length).toBeLessThanOrEqual(7);
  });

  test("works out the last page from the Paged envelope", () => {
    expect(lastPage(0, 20)).toBe(1);
    expect(lastPage(20, 20)).toBe(1);
    expect(lastPage(21, 20)).toBe(2);
  });

  test("accepts a jump only to a page that exists", () => {
    expect(parsePage("3", 10)).toBe(3);
    expect(parsePage(" 10 ", 10)).toBe(10);
    for (const bad of ["0", "11", "-1", "2.5", "1e1", "", "abc"]) expect(parsePage(bad, 10)).toBeNull();
  });

  test("summarises the rows on the page", () => {
    expect(rangeSummary(1, 20, 45)).toBe("1–20 of 45");
    expect(rangeSummary(3, 20, 45)).toBe("41–45 of 45");
    expect(rangeSummary(1, 20, 1200)).toBe("1–20 of 1,200");
  });
});

describe("TB-2 column visibility", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  function useStorage(storage: Partial<Storage>) {
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  }

  test("shows defaults when nothing is stored", () => {
    expect([...visibleIds(COLUMNS, {})]).toEqual(["ref", "title", "actions"]);
  });

  test("applies stored choices, but never hides a required column", () => {
    expect([...visibleIds(COLUMNS, { title: false, secret: true, ref: false })]).toEqual(["ref", "secret", "actions"]);
  });

  test("reads a stored choice for its own table", () => {
    useStorage({ getItem: (key: string) => (key === storageKey("t") ? '{"title":false,"bogus":"yes"}' : null) });
    expect(readChoices("t")).toEqual({ title: false });
  });

  test("falls back to defaults when storage throws", () => {
    useStorage({
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(readChoices("t")).toEqual({});
  });

  test("falls back to defaults when storage holds something else", () => {
    for (const raw of ["not json", "[1,2]", "null", "42"]) {
      useStorage({ getItem: () => raw });
      expect(readChoices("t")).toEqual({});
    }
  });
});
