import { useState } from "react";
import { ApiError } from "../../lib/api.js";
import type { ExportFormat } from "../../lib/table-types.js";
import { useToast } from "../Toast.js";
import { PANEL_CLASS, useDisclosure } from "./useDisclosure.js";

const FORMATS: { format: ExportFormat; label: string; hint: string }[] = [
  { format: "csv", label: "Download CSV", hint: "Opens in Excel or Google Sheets" },
  { format: "pdf", label: "Download PDF", hint: "Landscape, ready to print" },
];

// TB-4: one button that offers CSV or PDF. `onExport` fetches and downloads, and
// resolves with the sentence to confirm it ("Exported 120 reports."). Success is a
// toast and closes the panel; a failure stays in the open panel, beside the
// buttons that can retry it.
export function ExportMenu({
  onExport,
  disabled,
}: {
  onExport: (format: ExportFormat) => Promise<string>;
  /** Set when there is nothing to export. */
  disabled?: boolean;
}) {
  const { open, close, rootRef, triggerProps, panelId } = useDisclosure();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function run(format: ExportFormat) {
    setBusy(format);
    setError(null);
    try {
      const message = await onExport(format);
      close(true);
      toast(message);
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The file could not be made. Check your connection and try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="btn btn-secondary min-h-9"
        disabled={disabled}
        {...triggerProps}
        onClick={() => {
          setError(null);
          triggerProps.onClick();
        }}
      >
        {busy ? "Exporting…" : "Export"}
      </button>

      {open && (
        <div id={panelId} className={PANEL_CLASS} aria-busy={busy !== null}>
          <p className="m-0 text-[12px] text-muted">Every row that matches the filters, with the columns shown.</p>

          {FORMATS.map(({ format, label, hint }) => (
            <button
              key={format}
              type="button"
              className="btn btn-secondary flex-col items-start gap-0 text-left"
              disabled={busy !== null}
              onClick={() => void run(format)}
            >
              <span>{busy === format ? "Preparing…" : label}</span>
              <span className="font-body text-[11px] font-normal text-muted">{hint}</span>
            </button>
          ))}

          {error && (
            <p role="alert" className="m-0 text-[12px] text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
