import { STATUS_COLOR } from "../lib/maps.js";
import type { ReportStatus } from "../lib/types.js";

// A report's pin: a square in its status colour, zero radius like everything else
// here. A resolved pin is green with a check (SW-5) and a rejected one dark with a
// cross (SW-7), so colour is not the only signal, matching StatusBadge. The marker
// around it carries the accessible name.
export function StatusPin({ status, size }: { status: ReportStatus; size: number }) {
  return (
    <span
      aria-hidden="true"
      data-status={status}
      style={{
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        background: STATUS_COLOR[status],
        border: "2px solid var(--color-bg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {(status === "resolved" || status === "rejected") && (
        <svg width="100%" height="100%" viewBox="0 0 12 12" fill="none" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="square">
          <path d={status === "resolved" ? "M2 6.5 4.75 9 10 3" : "M3 3l6 6M9 3 3 9"} />
        </svg>
      )}
    </span>
  );
}
