import { useState } from "react";
import { Alert, Button } from "./ui.js";
import { api } from "../lib/api.js";
import { useAction } from "../lib/useApi.js";

// #70 on the dashboard: residency proof files are removed 30 days after they stop
// being current; an account's current proof never is, and every proof record
// stays (DM-1). A check comes first and says what would go; removing asks again,
// because the files cannot be brought back.
type ProofPurgeResult = {
  dry_run: boolean;
  retention_days: number;
  replaced: number;
  unattached: number;
  removed: number;
  failed: number;
  more: boolean;
};

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-PH")} ${n === 1 ? one : many}`;

export function ProofRetention() {
  const [found, setFound] = useState<ProofPurgeResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");

  const { run, pending, error } = useAction((body: { dry_run: boolean }) =>
    api.post<{ result: ProofPurgeResult }>("/maintenance/purge-expired-proofs", body),
  );
  const total = found ? found.replaced + found.unattached : 0;

  async function check() {
    setConfirming(false);
    const response = await run({ dry_run: true });
    if (!response) return;
    const { replaced, unattached, more } = response.result;
    setFound(response.result);
    setMessage(
      replaced + unattached === 0
        ? "Nothing to remove. No proof file is past the 30-day retention period."
        : `${count(replaced, "replaced proof", "replaced proofs")} and ${count(unattached, "upload that never reached an account", "uploads that never reached an account")} are past the 30-day retention period.${more ? " More will be found after this cleanup." : ""}`,
    );
  }

  async function remove() {
    const response = await run({ dry_run: false });
    setConfirming(false);
    if (!response) return;
    setFound(null);
    setMessage(
      `Removed ${count(response.result.removed, "proof file", "proof files")}. Every account's current proof and every proof record are kept.${response.result.more ? " Check again to remove the rest." : ""}`,
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="proof-retention-title">
      <h6 id="proof-retention-title">Proof retention</h6>
      <p className="text-[13px] text-muted !m-0 max-w-prose">
        Residency proofs that were replaced, and uploads that never reached an account, can be removed 30 days later.
        Each account&rsquo;s current proof is never removed, and the record of every proof and decision stays.
      </p>

      <p role="status" aria-live="polite" className={message ? "text-[13px] !m-0" : "sr-only"}>
        {message}
      </p>
      {error && <Alert title="Could not finish the proof cleanup">{error.message}</Alert>}

      {confirming && found ? (
        <div className="flex flex-col gap-2 border border-danger bg-danger-100 p-3 max-w-prose" role="group" aria-labelledby="proof-retention-confirm">
          <p id="proof-retention-confirm" className="text-[13px] !m-0">
            Remove {count(total, "proof file", "proof files")} for good? The files cannot be restored.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="danger" disabled={pending} onClick={remove}>
              {pending ? "Removing…" : `Yes, remove ${count(total, "file", "files")}`}
            </Button>
            <Button type="button" disabled={pending} onClick={() => setConfirming(false)}>
              Keep them
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={check}>
            {pending ? "Checking…" : "Check expired proofs"}
          </Button>
          {total > 0 && (
            <Button type="button" variant="danger-outline" disabled={pending} onClick={() => setConfirming(true)}>
              Remove expired proofs
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
