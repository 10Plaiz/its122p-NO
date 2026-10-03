import type { Column } from "../../lib/table-types.js";
import { PANEL_CLASS, useDisclosure } from "./useDisclosure.js";

// TB-2: show and hide a table's columns. Required columns are listed but fixed,
// so the person can see they exist and why they cannot be turned off. A column
// with no header text of its own (actions) is not listed at all.
export function ColumnMenu<Row>({
  columns,
  visible,
  onToggle,
  onReset,
}: {
  columns: Column<Row>[];
  visible: ReadonlySet<string>;
  onToggle: (id: string, shown: boolean) => void;
  onReset: () => void;
}) {
  const { open, rootRef, triggerProps, panelId } = useDisclosure();
  const listed = columns.filter((column) => !column.srOnlyHeader);
  const hiddenCount = listed.filter((column) => !visible.has(column.id)).length;

  return (
    <div ref={rootRef} className="relative">
      <button type="button" className="btn btn-secondary min-h-9" {...triggerProps}>
        Columns
        {hiddenCount > 0 && (
          <span className="font-mono text-[11px] text-muted tabular-nums">({hiddenCount} hidden)</span>
        )}
      </button>

      {open && (
        <div id={panelId} className={PANEL_CLASS}>
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
              Show columns
            </legend>
            {listed.map((column) => (
              <label
                key={column.id}
                className={`flex items-center gap-2 py-1 text-[13px] ${column.required ? "text-muted" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  checked={visible.has(column.id)}
                  disabled={column.required}
                  onChange={(event) => onToggle(column.id, event.target.checked)}
                />
                <span className="min-w-0 flex-1">{column.header}</span>
                {column.required && <span className="font-mono text-[10px] uppercase tracking-wider">Always</span>}
              </label>
            ))}
          </fieldset>

          <button type="button" className="btn btn-ghost self-start text-[12px]" onClick={onReset}>
            Reset to default
          </button>
        </div>
      )}
    </div>
  );
}
