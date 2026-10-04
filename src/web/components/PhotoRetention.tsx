import { useState } from "react";
import { Alert, Button } from "./ui.js";
import { api } from "../lib/api.js";
import { useAction } from "../lib/useApi.js";

// DM-2 on the dashboard: the photo files of reports cancelled more than 90 days ago
// are removed; the report and photo rows stay (DM-1) and the page then says the
// photo was removed. A check comes first and says what would go; removing asks
// again, because files cannot be brought back.
type PurgeResult = {
  dry_run: boolean;
  retention_days: number;
  reports: number;
  photos: number;
  purged: number;
  failed: number;
};

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-PH")} ${n === 1 ? one : many}`;

export function PhotoRetention() {
  const [found, setFound] = useState<PurgeResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");

  const { run, pending, error } = useAction((body: { dry_run: boolean }) =>
    api.post<{ result: PurgeResult }>("/maintenance/purge-cancelled-photos", body),
  );

  async function check() {
    setConfirming(false);
    const response = await run({ dry_run: true });
    if (!response) return;
    setFound(response.result);
    setMessage(
      response.result.photos === 0
        ? "Nothing to remove. No cancelled report has photos older than 90 days."
        : `${count(response.result.photos, "photo", "photos")} from ${count(response.result.reports, "cancelled report", "cancelled reports")} ${response.result.photos === 1 ? "is" : "are"} past the 90-day retention period.`,
    );
  }

  async function remove() {
    const response = await run({ dry_run: false });
    setConfirming(false);
    if (!response) return;
    setFound(null);
    setMessage(`Removed ${count(response.result.purged, "photo", "photos")}. The reports and their history are kept.`);
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="retention-title">
      <h6 id="retention-title">Photo retention</h6>
      <p className="text-[13px] text-muted !m-0 max-w-prose">
        Photos of reports cancelled more than 90 days ago can be removed. The reports, their history, and the photo
        records stay; the report page then says the photo was removed.
      </p>

      <p role="status" aria-live="polite" className={message ? "text-[13px] !m-0" : "sr-only"}>
        {message}
      </p>
      {error && <Alert title="Could not finish the photo cleanup">{error.message}</Alert>}

      {confirming && found ? (
        <div className="flex flex-col gap-2 border border-accent p-3 max-w-prose" role="group" aria-labelledby="retention-confirm">
          <p id="retention-confirm" className="text-[13px] !m-0">
            Remove {count(found.photos, "photo", "photos")} for good? The files cannot be restored.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={pending} onClick={remove}>
              {pending ? "Removing…" : `Yes, remove ${count(found.photos, "photo", "photos")}`}
            </Button>
            <Button type="button" disabled={pending} onClick={() => setConfirming(false)}>
              Keep them
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={check}>
            {pending ? "Checking…" : "Check expired photos"}
          </Button>
          {found && found.photos > 0 && (
            <Button type="button" variant="primary" disabled={pending} onClick={() => setConfirming(true)}>
              Remove expired photos
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
