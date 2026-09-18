import { Link, useParams } from "react-router-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import { Alert, Loading, StatusBadge, formatDateTime } from "../components/ui.js";
import { TILE_ATTRIBUTION, TILE_URL, pinFor } from "../lib/leaflet.js";
import { useApi } from "../lib/useApi.js";
import { STATUS_LABEL } from "../lib/types.js";
import type { Report, ReportUpdate } from "../lib/types.js";

// Wireframe 1j. Visible to the report's owner, to assigned staff and to admins —
// assertCanView decides, so an id guessed from the URL returns 403 rather than data.
export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, error, loading } = useApi<{ report: Report }>(id ? `/reports/${id}` : null);
  const { data: history } = useApi<{ updates: ReportUpdate[] }>(id ? `/reports/${id}/updates` : null);

  if (loading) return <Loading label="Loading the report" />;

  if (error) {
    return (
      <div className="flex flex-col gap-4 items-start">
        <Alert title="Could not open this report">{error.message}</Alert>
        <Link to="/my-reports" className="btn btn-secondary">
          Back to my reports
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const report = data.report;
  const initial = report.photos.filter((photo) => photo.kind === "initial");
  const resolution = report.photos.filter((photo) => photo.kind === "resolution");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="font-mono text-[11px] text-muted">{report.reference_code}</span>
          <StatusBadge status={report.status} />
        </div>
        <h2>{report.title}</h2>
        <p className="text-muted font-mono text-[11px]">
          {report.category?.name ?? "Uncategorised"} &middot; filed {formatDateTime(report.submitted_at)}
          {report.resolved_at ? ` · resolved ${formatDateTime(report.resolved_at)}` : ""}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h6>What was reported</h6>
            <p className="text-[14px] whitespace-pre-line">{report.description}</p>
            {report.address_text && <p className="text-muted text-[13px]">{report.address_text}</p>}
          </section>

          {report.assigned_staff && (
            <section className="flex flex-col gap-1 border-t border-divider pt-3">
              <h6>Assigned to</h6>
              <p className="text-[13px]">{report.assigned_staff.name}</p>
            </section>
          )}

          {initial.length > 0 && (
            <section className="flex flex-col gap-2 border-t border-divider pt-3">
              <h6>Evidence</h6>
              <div className="grid grid-cols-2 gap-2">
                {initial.map((photo) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="grayscale block">
                    <img src={photo.url} alt="" loading="lazy" className="w-full h-32 object-cover" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {resolution.length > 0 && (
            <section className="flex flex-col gap-2 border-t border-divider pt-3">
              <h6>Proof of repair</h6>
              <div className="grid grid-cols-2 gap-2">
                {resolution.map((photo) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="grayscale block">
                    <img src={photo.url} alt="" loading="lazy" className="w-full h-32 object-cover" />
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="h-[260px] border-2 border-divider">
            <MapContainer
              center={[report.latitude, report.longitude]}
              zoom={16}
              scrollWheelZoom={false}
              className="h-full w-full"
            >
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              <Marker position={[report.latitude, report.longitude]} icon={pinFor(report.status)} />
            </MapContainer>
          </div>

          <section className="flex flex-col gap-3">
            <h6>History</h6>
            <Timeline updates={history?.updates ?? []} />
          </section>
        </div>
      </div>

      <Link to="/my-reports" className="btn btn-secondary self-start">
        Back to my reports
      </Link>
    </div>
  );
}

// Newest first, as the API returns it. Each row says who did what, so the citizen
// can see the report was actually handled rather than only that it moved.
function Timeline({ updates }: { updates: ReportUpdate[] }) {
  if (updates.length === 0) {
    return <p className="text-muted text-[13px]">Nothing has happened yet. You will be notified when it does.</p>;
  }

  return (
    <ol className="flex flex-col gap-0 border-l-2 border-divider pl-4">
      {updates.map((update) => (
        <li key={update.id} className="relative pb-4">
          <span
            className="absolute -left-[21px] top-1.5 w-2 h-2 bg-accent"
            aria-hidden="true"
          />
          <p className="text-[13px]">
            {update.new_status ? (
              <>
                {update.previous_status ? (
                  <>
                    {STATUS_LABEL[update.previous_status]} &rarr;{" "}
                    <strong>{STATUS_LABEL[update.new_status]}</strong>
                  </>
                ) : (
                  <strong>{STATUS_LABEL[update.new_status]}</strong>
                )}
              </>
            ) : (
              update.update_type.replace(/[._]/g, " ")
            )}
          </p>
          {update.details && <p className="text-[13px] text-muted pt-0.5">{update.details}</p>}
          <p className="font-mono text-[10px] text-muted pt-1">
            {formatDateTime(update.created_at)}
            {update.author ? ` · ${update.author.name} (${update.author.role})` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
