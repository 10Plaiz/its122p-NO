import { BARANGAYS } from "../lib/barangays.js";
import { Field, Select } from "./ui.js";
import { FilterOption } from "./FilterOption.js";
import type { OptionCounts } from "../lib/filter-counts.js";

// SW-1: narrow a report list to one barangay. Used by the public board, All reports,
// and the staff queue; the server checks the value against the same list.
export function BarangayFilter({
  value,
  onChange,
  id = "barangay",
  counts,
}: {
  value: string;
  onChange: (barangay: string) => void;
  id?: string;
  counts?: OptionCounts;
}) {
  return (
    <Field label="Barangay" htmlFor={id}>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <FilterOption value="" label="Any barangay" counts={counts} />
        {BARANGAYS.map((name) => (
          <FilterOption key={name} value={name} label={name} counts={counts} />
        ))}
      </Select>
    </Field>
  );
}
