import type { Key } from "react";
import type { Column } from "../../lib/table-types.js";

// The table half of a data table: the visible columns of one page of rows, in the
// design system's .table. Search, filters, paging and export sit around it
// (TableToolbar, NumberedPagination), because a screen arranges those itself.
//
// `data-table` and `data-column` are stable hooks for browser tests, which should
// not depend on header wording.
export function DataTable<Row>({
  id,
  columns,
  visible,
  rows,
  rowKey,
  caption,
  className = "",
}: {
  /** Same id the column choices are stored under. */
  id: string;
  columns: Column<Row>[];
  visible: ReadonlySet<string>;
  rows: Row[];
  rowKey: (row: Row) => Key;
  /** Read by screen readers only: what the table lists. */
  caption: string;
  /** Classes for the scroll wrapper, e.g. "hidden md:block" beside a mobile card list. */
  className?: string;
}) {
  const shown = columns.filter((column) => visible.has(column.id));

  return (
    <div className={`relative overflow-x-auto ${className}`.trim()}>
      <table className="table w-full" data-table={id}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {shown.map((column) => (
              <th key={column.id} scope="col" data-column={column.id} className="whitespace-nowrap">
                {column.srOnlyHeader ? <span className="sr-only">{column.header}</span> : column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {shown.map((column) => (
                <td key={column.id} data-column={column.id} className={column.className}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
