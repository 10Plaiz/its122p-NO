import { useCallback, useMemo, useState } from "react";
import type { Column } from "../../lib/table-types.js";

// Which columns a table shows, remembered per table in this browser.
//
// Only the columns the person has toggled are stored, as { id: shown }. A column
// added to the table later therefore gets its own default instead of inheriting a
// choice the person never made, and a column that no longer exists is ignored.
type Choices = Record<string, boolean>;

export function storageKey(tableId: string) {
  return `kamoti.table.${tableId}.columns`;
}

// localStorage throws in some privacy modes and when it is full, and what it holds
// may be anything. Every failure falls back to the table's defaults.
export function readChoices(tableId: string): Choices {
  try {
    const raw = localStorage.getItem(storageKey(tableId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    );
  } catch {
    return {};
  }
}

function writeChoices(tableId: string, choices: Choices) {
  try {
    if (Object.keys(choices).length === 0) localStorage.removeItem(storageKey(tableId));
    else localStorage.setItem(storageKey(tableId), JSON.stringify(choices));
  } catch {
    // The choice still holds for this visit; it just is not remembered.
  }
}

/** The ids a table shows: required columns always, the rest by choice or default. */
export function visibleIds<Row>(columns: Column<Row>[], choices: Choices): Set<string> {
  return new Set(
    columns
      .filter((column) => column.required || (choices[column.id] ?? !column.defaultHidden))
      .map((column) => column.id),
  );
}

export function useColumnVisibility<Row>(tableId: string, columns: Column<Row>[]) {
  const [choices, setChoices] = useState<Choices>(() => readChoices(tableId));

  const visible = useMemo(() => visibleIds(columns, choices), [columns, choices]);

  const setShown = useCallback(
    (id: string, shown: boolean) => {
      setChoices((current) => {
        const next = { ...current, [id]: shown };
        writeChoices(tableId, next);
        return next;
      });
    },
    [tableId],
  );

  const reset = useCallback(() => {
    writeChoices(tableId, {});
    setChoices({});
  }, [tableId]);

  return { visible, setShown, reset };
}
