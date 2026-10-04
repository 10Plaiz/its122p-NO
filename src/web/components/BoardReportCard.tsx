import type { PublicReport } from "../lib/types.js";
import { PhotoFrame, StatusBadge, formatDate } from "./ui.js";

export interface BoardReportCardProps {
  report: PublicReport;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

export function BoardReportCard({ report, isSelected, onToggle }: BoardReportCardProps) {
  const panelId = `report-panel-${report.id}`;
  const headerId = `report-header-${report.id}`;
  const titleId = `report-title-${report.id}`;

  return (
    <article
      className={`card p-4 flex flex-col gap-3 transition-colors border ${
        isSelected
          ? "border-accent shadow-sm"
          : "border-divider hover:border-neutral-500"
      }`}
    >
      {/* 1. Title + Location Unit: Tight vertical clustering */}
      <div className="flex flex-col">
        <h3
          id={titleId}
          className="card-title select-text cursor-text text-[16px] font-bold text-text leading-snug !m-0 !mb-0"
        >
          {report.title}
        </h3>
        {report.address_text && (
          <p className="text-[12px] font-medium text-neutral-700 select-text cursor-text !m-0 !mt-0.5 leading-tight">
            {report.address_text}
          </p>
        )}
      </div>

      {/* 2. Control Row: Category & Status on Left, Date & Chevron on Right */}
      <div className="flex items-center justify-between gap-3 flex-wrap pt-0.5">
        {/* Swapped: Category first, then StatusBadge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="tag tag-outline text-[12px] font-semibold tracking-wide">
            {report.category}
          </span>
          <StatusBadge status={report.status} />
        </div>

        {/* Date on the left of Chevron button */}
        <div className="flex items-center gap-3 shrink-0">
          {report.barangay && <span className="text-[12px] font-medium text-neutral-700">{report.barangay}</span>}
          <time
            dateTime={report.submitted_at}
            className="text-[12px] font-medium text-neutral-700 select-text"
          >
            {formatDate(report.submitted_at)}
          </time>

          <button
            id={headerId}
            type="button"
            title={isSelected ? "Collapse details" : "Expand details"}
            aria-expanded={isSelected}
            aria-controls={isSelected ? panelId : undefined}
            onClick={() => onToggle(report.id)}
            className="size-8 shrink-0 flex items-center justify-center bg-surface hover:bg-neutral-300 border border-divider transition-colors focus-visible:outline-2 focus-visible:outline-accent cursor-pointer"
          >
            <svg
              className={`size-4 transform transition-transform duration-150 motion-reduce:transition-none ${
                isSelected ? "rotate-180 text-accent" : "text-text"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            <span className="sr-only">
              {isSelected ? `Collapse details for ${report.title}` : `Expand details for ${report.title}`}
            </span>
          </button>
        </div>
      </div>

      {/* 3. Expanded Section: Distinct surface tint and edge-to-edge border */}
      {isSelected && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={titleId}
          className="-mx-4 -mb-4 p-4 mt-1 bg-neutral-300/60 border-t border-divider flex flex-col gap-2.5"
        >
          {/* Reference ID in standard case (no caps lock / uppercase) */}
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-600">
            <span className="text-neutral-500 text-[11px]">Reference:</span>
            <span className="font-semibold select-text cursor-text text-neutral-800">
              {report.reference_code}
            </span>
          </div>

          <p className="text-[13px] select-text cursor-text leading-relaxed text-text !m-0">
            {report.description}
          </p>

          {/* SW-7: the board says why a report was closed without a repair. */}
          {report.status === "rejected" && report.rejection_reason && (
            <div className="flex flex-col gap-1 border-l-2 border-neutral-800 pl-2.5">
              <span className="font-mono text-[11px] text-neutral-800">Why it was rejected</span>
              <p className="text-[13px] leading-relaxed text-text whitespace-pre-line break-words !m-0">
                {report.rejection_reason}
              </p>
            </div>
          )}

          {report.photos?.[0] && (
            <PhotoFrame
              src={report.photos[0].url}
              alt={`Photo of the issue reported as ${report.title}`}
              imageClassName="h-48"
            />
          )}
        </div>
      )}
    </article>
  );
}
