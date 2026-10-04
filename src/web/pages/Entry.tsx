import { Link } from "react-router-dom";
import { useApi } from "../lib/useApi.js";
import { useAuth } from "../lib/auth.js";
import { PROOF_STEP_PATH, residencyLocked } from "../lib/residency.js";
import type { PublicStats } from "../lib/types.js";

const STEPS = [
  { n: "01", title: "Drop a pin, add a photo", body: "Mark exactly where the problem is and show what it looks like." },
  { n: "02", title: "Staff review and dispatch", body: "Your report is checked, categorised and assigned to the right team." },
  { n: "03", title: "You get notified at every step", body: "Every status change reaches you, from review through to repair." },
];

export function EntryPage() {
  const { user } = useAuth();
  // The live count in the wireframe. It fails quietly — the page is still useful
  // without a number, so a stats outage must not block the call to action.
  const { data: stats } = useApi<PublicStats>("/public/stats");

  // A signed-out visitor cannot file a report, so send them to sign in first.
  const reportHref = user?.role === "citizen" ? "/report/new" : "/signin";
  // UA-8: a citizen locked to the proof upload sees the button greyed, like the
  // menu, with the reason and the way out beside it (KI-18).
  const locked = residencyLocked(user);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4 items-start">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          Key alert and monitoring for online
          <br />
          tracking of infrastructures
        </p>
        <h1 className="max-w-3xl">Report broken infrastructure. Watch it get fixed.</h1>
        <p className="text-muted max-w-prose">
          Damaged roads, dead streetlights, blocked drainage and missing signs &mdash; reported in one
          place, tracked in the open, and closed only when the work is done.
        </p>

        <div className="flex flex-wrap gap-3 pt-2">
          {locked ? (
            <a role="link" aria-disabled="true" aria-describedby="report-locked" className="btn btn-primary opacity-50 cursor-not-allowed">
              Report an issue
            </a>
          ) : (
            <Link to={reportHref} className="btn btn-primary">
              Report an issue
            </Link>
          )}
          <Link to="/board" className="btn btn-secondary">
            Browse the public board
          </Link>
        </div>
        {locked && (
          <p id="report-locked" className="text-[13px] !m-0">
            Send your proof of residency first.{" "}
            <Link to={PROOF_STEP_PATH} className="underline">
              Upload it now
            </Link>
          </p>
        )}
      </section>

      <hr className="hr" />

      <section className="flex flex-col gap-6">
        <h6>How it works</h6>
        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="flex gap-3 items-start">
              <span className="font-mono text-[11px] font-semibold text-accent pt-1">{step.n}</span>
              <div className="flex flex-col gap-1">
                <h5>{step.title}</h5>
                <p className="text-muted text-[13px]">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Link
        to="/board"
        className="flex items-center justify-between gap-4 border-2 border-divider p-4 no-underline"
      >
        <span className="font-mono text-[12px]">
          {stats ? `${stats.total} reports on the board` : "See what has been reported"}
        </span>
        <span className="font-mono text-[12px] font-semibold text-accent">VIEW &rarr;</span>
      </Link>
    </div>
  );
}
