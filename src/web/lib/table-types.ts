import type { ReactNode } from "react";

// One column of a DataTable, declared once and read three ways: the header and
// cell on screen, the column menu, and the CSV/PDF export. Keeping all three on
// one object is what makes "export the visible columns" true by construction.
export type Column<Row> = {
  /** Stable key, stored in localStorage when the column is hidden. Never rename. */
  id: string;
  /** Header text, also the column menu label and the export header. */
  header: string;
  /** Always shown. The column menu lists it as fixed so a row stays identifiable. */
  required?: boolean;
  /** Hidden until the person turns it on. */
  defaultHidden?: boolean;
  /** Drawn in the header for screen readers only (an actions column, say). */
  srOnlyHeader?: boolean;
  /** Classes for the column's <td>. */
  className?: string;
  cell: (row: Row) => ReactNode;
  /** Plain text for CSV and PDF. A column without one (actions) is never exported. */
  exportValue?: (row: Row) => string;
};

/** The two file formats an export can produce. Mirrors EXPORT_FORMATS in src/server/lib/query.ts. */
export type ExportFormat = "csv" | "pdf";

/** The export envelope from GET /api/exports/*: every matching row, up to `limit`. */
export type ExportResult<K extends string, T> = { [P in K]: T[] } & {
  total: number;
  capped: boolean;
  limit: number;
};
