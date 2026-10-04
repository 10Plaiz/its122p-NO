// The data-table kit (TB-1..4). A screen composes these itself:
//
//   TableToolbar   title left; search, filters, ColumnMenu, ExportMenu right
//   DataTable      the visible columns of one page of rows
//   NumberedPagination   Previous · 1 2 3 … 9 10 · Next, with jump-to-page
//
// Column definitions (lib/table-types.ts) drive the table, the column menu and
// the export alike; useColumnVisibility remembers the choice per table.
export { DataTable } from "./DataTable.js";
export { ColumnMenu } from "./ColumnMenu.js";
export { ExportMenu } from "./ExportMenu.js";
export { NumberedPagination } from "./NumberedPagination.js";
export { TableToolbar, ToolbarItem } from "./TableToolbar.js";
export { useColumnVisibility } from "./useColumnVisibility.js";
export { exportReports, reportColumn, sortLabel } from "./report-columns.js";
