import { Link } from "react-router-dom";
import { RatingAverage } from "../components/FeedbackSummary.js";
import { Alert, Loading } from "../components/ui.js";
import { useApi } from "../lib/useApi.js";
import { OPEN_STATUSES, STATUSES, STATUS_LABEL } from "../lib/types.js";
import type { Analytics } from "../lib/types.js";

// Wireframe 1o. Every number here comes from GET /api/admin/analytics, which
// computes them server-side over all reports.
export function AdminDashboardPage() {
  const { data, error, loading } = useApi<Analytics>("/admin/analytics");

  if (loading) return <Loading label="Loading analytics" />;
  if (error) return <Alert title="Could not load analytics">{error.message}</Alert>;
  if (!data) return null;

  const categories = Object.entries(data.by_category).sort((a, b) => b[1] - a[1]);
  const busiest = categories[0]?.[1] ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h2>Dashboard</h2>
        <p className="text-muted text-[13px]">Volume, status spread and resolution time across every report.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 border-2 border-divider">
        <Metric label="Total reports" value={data.total_reports} />
        <Metric label="Resolved" value={data.resolved_count} />
        <Metric
          label="Avg. days to resolve"
          value={data.average_resolution_days ?? "—"}
          hint={data.average_resolution_days === null ? "Nothing resolved yet" : undefined}
        />
        <Metric
          label="Open"
          // Counted from the open statuses, so a new closed status (rejected) can
          // never be mistaken for open work.
          value={OPEN_STATUSES.reduce((sum, status) => sum + (data.by_status[status] ?? 0), 0)}
        />
      </div>

      {/* FB-1: every reporter rating, across all staff. */}
      <section className="flex flex-col gap-3">
        <h6>Citizen rating</h6>
        <RatingAverage />
      </section>

      <section className="flex flex-col gap-3">
        <h6>By status</h6>
        <div className="flex flex-col gap-2">
          {STATUSES.map((status) => (
            <Bar
              key={status}
              label={STATUS_LABEL[status]}
              value={data.by_status[status] ?? 0}
              max={data.total_reports}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h6>By category</h6>
        {categories.length === 0 ? (
          <p className="text-muted text-[13px]">No reports have been filed yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {categories.map(([name, count]) => (
              <Bar key={name} label={name} value={count} max={busiest} />
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3 border-t-2 border-divider pt-4">
        <Link to="/admin/reports" className="btn btn-primary">
          Manage reports
        </Link>
        <Link to="/admin/users" className="btn btn-secondary">
          Manage users
        </Link>
        <Link to="/admin/logs" className="btn btn-secondary">
          Activity log
        </Link>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="p-4 flex flex-col gap-1 border-r border-b border-divider last:border-r-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</span>
      <span className="text-3xl font-extrabold leading-none">{value}</span>
      {hint && <span className="text-muted text-[11px]">{hint}</span>}
    </div>
  );
}

// A plain proportional rule rather than a chart library: the system is flat and
// rectangular, and one dependency fewer is one fewer thing to explain.
function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-[13px]">{label}</span>
      <span className="flex-1 h-4 bg-neutral-200" role="presentation">
        <span className="block h-full bg-accent" style={{ width: `${percent}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right font-mono text-[12px]">{value}</span>
    </div>
  );
}
