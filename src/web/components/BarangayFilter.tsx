import { BARANGAYS } from "../lib/barangays.js";
import { Field, Select } from "./ui.js";

// SW-1: narrow a report list to one barangay. Used by the public board, All reports,
// and the staff queue; the server checks the value against the same list.
export function BarangayFilter({
  value,
  onChange,
  id = "barangay",
}: {
  value: string;
  onChange: (barangay: string) => void;
  id?: string;
}) {
  return (
    <Field label="Barangay" htmlFor={id}>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Any barangay</option>
        {BARANGAYS.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
