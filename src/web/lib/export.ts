import type { Column, ExportFormat } from "./table-types.js";

// Turns table rows into a CSV or PDF file in the browser. The server returns the
// rows (GET /api/exports/*, already role-scoped and filtered); this decides what
// the file holds, which is exactly the columns the person has on screen.

// A cell that starts with one of these is read as a formula by Excel, Sheets and
// LibreOffice. A report title such as "=HYPERLINK(...)" typed by a citizen would
// otherwise run on the machine of the admin who opened the export (CSV injection,
// OWASP). Prefixing an apostrophe makes the spreadsheet show it as plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

export function guardFormula(value: string) {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

// RFC 4180: a field holding a comma, quote or line break is wrapped in quotes,
// and a quote inside it is doubled.
export function csvField(value: string) {
  const safe = guardFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// The BOM tells Excel the file is UTF-8, so a name like "Peñaflor" survives a
// double-click open. Records end in CRLF, as RFC 4180 specifies.
export function toCsv(headers: string[], body: string[][]) {
  const lines = [headers, ...body].map((row) => row.map(csvField).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** The columns an export writes: visible on screen, and with a text value to write. */
export function exportColumns<Row>(columns: Column<Row>[], visible: ReadonlySet<string>) {
  return columns.filter((column) => visible.has(column.id) && column.exportValue);
}

export function tableData<Row>(columns: Column<Row>[], visible: ReadonlySet<string>, rows: Row[]) {
  const kept = exportColumns(columns, visible);
  return {
    headers: kept.map((column) => column.header),
    body: rows.map((row) => kept.map((column) => column.exportValue!(row))),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

// kamoti-reports-2026-10-02.csv. The local date, because that is the day the
// person exporting thinks it is.
export function exportFilename(name: string, format: ExportFormat, date = new Date()) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `kamoti-${name}-${day}.${format}`;
}

/** "Status: Pending · Search: “pothole”", or a plain statement that nothing narrowed it. */
export function describeFilters(filters: [label: string, value: string | null | undefined][]) {
  const active = filters.filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (active.length === 0) return "Filters: none (every row you can see)";
  return `Filters: ${active.map(([label, value]) => `${label}: ${value}`).join(" · ")}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers read the URL after click() returns, so it is released a beat later.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, headers: string[], body: string[][]) {
  download(new Blob([toCsv(headers, body)], { type: "text/csv;charset=utf-8" }), filename);
}

type PdfInput = {
  filename: string;
  title: string;
  /** Lines under the title: the active filters, the generated date, a cap notice. */
  details: string[];
  headers: string[];
  body: string[][];
};

// Design-system colours as RGB, since jsPDF takes no CSS: --color-text, --color-bg,
// --color-surface from app.css.
const INK: [number, number, number] = [32, 30, 29];
const PAPER: [number, number, number] = [243, 242, 242];
const SURFACE: [number, number, number] = [234, 233, 233];

// jsPDF is loaded only when someone exports a PDF, so its weight stays out of the
// bundle every visitor downloads.
export async function downloadPdf({ filename, title, details, headers, body }: PdfInput) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 40;
  const width = doc.internal.pageSize.getWidth() - margin * 2;

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let y = 66;
  for (const line of details) {
    const wrapped = doc.splitTextToSize(line, width) as string[];
    doc.text(wrapped, margin, y);
    y += wrapped.length * 12;
  }

  autoTable(doc, {
    head: [headers],
    body,
    startY: y + 6,
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: INK, overflow: "linebreak" },
    headStyles: { fillColor: INK, textColor: PAPER, fontStyle: "bold" },
    alternateRowStyles: { fillColor: SURFACE },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(`Page ${page}`, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 20, {
        align: "right",
      });
    },
  });

  doc.save(filename);
}

export function generatedLine(date = new Date()) {
  return `Generated ${date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

type ExportInput<Row> = {
  format: ExportFormat;
  /** Used in the filename: kamoti-<name>-YYYY-MM-DD.<format>. */
  name: string;
  /** The PDF's heading. */
  title: string;
  columns: Column<Row>[];
  visible: ReadonlySet<string>;
  rows: Row[];
  /** From describeFilters(). */
  filters: string;
  /** Set when the server stopped at its limit, so the file says it is not complete. */
  capNotice?: string | null;
};

/** Builds and downloads one export. Resolves once the file has been handed to the browser. */
export async function exportTable<Row>({ format, name, title, columns, visible, rows, filters, capNotice }: ExportInput<Row>) {
  const { headers, body } = tableData(columns, visible, rows);
  const filename = exportFilename(name, format);

  if (format === "csv") {
    downloadCsv(filename, headers, body);
    return;
  }

  const details = [filters, generatedLine(), `${body.length.toLocaleString("en-PH")} rows`];
  if (capNotice) details.push(capNotice);
  await downloadPdf({ filename, title, details, headers, body });
}

/** What to tell the person after an export: how many rows, and whether it stopped short. */
export function capNotice(total: number, limit: number, capped: boolean) {
  if (!capped) return null;
  return `Only the first ${limit.toLocaleString("en-PH")} of ${total.toLocaleString("en-PH")} matching rows were exported. Narrow the filters to export the rest.`;
}
