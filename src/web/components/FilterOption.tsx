import type { OptionCounts } from "../lib/filter-counts.js";
import { Button } from "./ui.js";

const numberFormat = new Intl.NumberFormat("en-PH");

export function FilterOption({ value, label, counts }: { value: string; label: string; counts?: OptionCounts }) {
  const count = counts ? value === "" ? counts.all : counts.values.get(value) ?? 0 : undefined;
  return <option value={value}>{label}{count === undefined ? "" : ` (${numberFormat.format(count)})`}</option>;
}

export function FilterCountsFeedback({ loading, error, onRetry }: {
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <div role="status" className={loading || error ? "flex flex-wrap items-center gap-2 text-muted text-[12px]" : "sr-only"}>
      {loading ? "Counting filter results…" : error ? "Filter counts are unavailable. You can still use the filters." : "Filter result counts are ready."}
      {error && <Button type="button" variant="ghost" onClick={onRetry}>Retry counts</Button>}
    </div>
  );
}
