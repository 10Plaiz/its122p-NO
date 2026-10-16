import { useEffect, useRef } from "react";
import type { PublicReport } from "../lib/types.js";
import { BoardReportCard } from "./BoardReportCard.js";
import { Button } from "./ui.js";

export function BoardReportPanel({ report, onClose, returnFocus }: { report: PublicReport; onClose: () => void; returnFocus: Element | null }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => { if (returnFocus instanceof HTMLElement) returnFocus.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return <div ref={panel} role="dialog" aria-modal="true" aria-label={`Selected report: ${report.title}`}
    className="fixed z-[1100] bottom-0 inset-x-0 max-h-[55dvh] overflow-y-auto overscroll-contain border-t-2 border-divider bg-bg p-3 shadow-xl"
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const controls = panel.current?.querySelectorAll<HTMLButtonElement>("button");
        const first = controls?.[0];
        const last = controls?.[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <div className="sticky top-0 z-10 bg-bg flex justify-between items-center gap-3 mb-2 pb-2 border-b border-divider">
      <p className="text-[12px] font-semibold">Selected map report</p>
      <Button type="button" onClick={onClose}>Close report</Button>
    </div>
    <BoardReportCard report={report} isSelected onToggle={onClose} idPrefix="map-panel" />
  </div>;
}
