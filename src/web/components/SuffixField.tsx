import { SUFFIXES } from "../lib/names.js";
import { Field, Input } from "./ui.js";

export function SuffixField({ id, value, onChange, error }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <Field label="Suffix" htmlFor={id} hint="Jr., Sr., II, III, IV, or V." error={error}>
      <Input id={id} name="suffix" autoComplete="honorific-suffix" list={`${id}-suggestions`} maxLength={12}
        value={value} onChange={(event) => onChange(event.target.value)} />
      <datalist id={`${id}-suggestions`}>
        {SUFFIXES.map((suffix) => <option key={suffix} value={suffix} />)}
      </datalist>
    </Field>
  );
}
