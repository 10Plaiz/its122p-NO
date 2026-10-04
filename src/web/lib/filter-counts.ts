export type FilterValues = Readonly<Record<string, string>>;

export type FilterRow = {
  id: string | number;
  values: FilterValues;
};

export type OptionCounts = {
  all: number;
  values: ReadonlyMap<string, number>;
};

// Each option counts matches for the other filters. Keeping its own selection
// out lets a resident see what switching to that option would return.
export function countFilterOptions(rows: readonly FilterRow[] | null, selected: FilterValues) {
  const result: Record<string, OptionCounts | undefined> = {};
  if (rows === null) return result;

  const filters = Object.entries(selected);
  for (const [name] of filters) {
    let all = 0;
    const values = new Map<string, number>();
    for (const row of rows) {
      if (!filters.every(([other, value]) => other === name || value === "" || row.values[other] === value)) continue;
      all++;
      const value = row.values[name] ?? "";
      values.set(value, (values.get(value) ?? 0) + 1);
    }
    result[name] = { all, values };
  }
  return result;
}
