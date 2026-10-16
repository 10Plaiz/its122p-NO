import { PUBLIC_STATUSES, STATUS_LABEL } from "../lib/types.js";
import { StatusPin } from "./StatusPin.js";

export function BoardLegend() {
  return <section aria-label="Map and report legend" className="border border-divider p-3 text-[12px]">
    <p className="font-semibold mb-2">Map and report legend</p>
    <ul className="flex flex-wrap gap-x-5 gap-y-2">
      {PUBLIC_STATUSES.map((status) => <li key={status} className="flex items-center gap-2">
        <StatusPin status={status} size={18} /><span>{STATUS_LABEL[status]}</span>
      </li>)}
    </ul>
    <p className="text-muted mt-2">A larger pin marks the selected report. Pins show reports on the current results page.</p>
  </section>;
}
