import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import { ALLOWED_TYPES, MAX_PHOTO_BYTES, PhotoPicker } from "../components/PhotoPicker.js";
import { useToast } from "../components/Toast.js";
import {
  Alert,
  Button,
  Field,
  Loading,
  PhotoFrame,
  StatusBadge,
  Textarea,
  formatDateTime,
} from "../components/ui.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { TILE_ATTRIBUTION, TILE_URL, pinFor } from "../lib/leaflet.js";
import { getReportReturnTarget } from "../lib/navigation.js";
import { useAction, useApi } from "../lib/useApi.js";
import { NEXT_STATUS, NEXT_STATUS_LABEL, STATUS_LABEL } from "../lib/types.js";
import type { Report, ReportUpdate } from "../lib/types.js";

// Wireframe 1m: working a single report. Staff advance the status, leave remarks and
// upload proof of repair. Everything here is also checked server-side by
// assertCanUpdate and changeStatus.
export function StaffReportPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const returnTarget = getReportReturnTarget(user?.role);

  const { data, error, loading, reload } = useApi<{ report: Report }>(id ? `/reports/${id}` : null);
  const { data: history, reload: reloadHistory } = useApi<{ updates: ReportUpdate[] }>(
    id ? `/reports/${id}/updates` : null,
  );

  function refresh() {
    reload();
    reloadHistory();
  }

  if (loading) return <Loading label="Loading the report" />;

  if (error) {
    return (
      <div className="flex flex-col gap-4 items-start">
        <Alert title="Could not open this report">{error.message}</Alert>
        <Link to={returnTarget.to} className="btn btn-secondary">
          {returnTarget.label}
        </Link>
      </div>
    );
  }

  if (!data || !id) return null;

  const report = data.report;

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
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h6>What was reported</h6>
            <p className="text-[14px] whitespace-pre-line">{report.description}</p>
            {report.address_text && <p className="text-muted text-[13px]">{report.address_text}</p>}
          </section>

          {/* Staff need a way to reach the reporter; the public board never shows this. */}
          {report.citizen && (
            <section className="flex flex-col gap-1 border-t border-divider pt-3">
              <h6>Reported by</h6>
              <p className="text-[13px]">{report.citizen.name}</p>
              <p className="text-muted font-mono text-[11px]">
                {report.citizen.email}
                {report.citizen.contact_number ? ` · ${report.citizen.contact_number}` : ""}
              </p>
            </section>
          )}

          {report.photos.length > 0 && (
            <section className="flex flex-col gap-2 border-t border-divider pt-3">
              <h6>Photos</h6>
              <div className="grid grid-cols-2 gap-2">
                {report.photos.map((photo) => {
                  // `kind` is the API's word for it; the screen says what it means.
                  const kindLabel = photo.kind === "resolution" ? "Proof of repair" : "Evidence";
                  return (
                    <a
                      key={photo.id}
                      href={photo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <PhotoFrame
                        src={photo.url}
                        alt={`${kindLabel} photo for report ${report.reference_code}`}
                      />
                      <span className="font-mono text-[9px] uppercase text-muted">{kindLabel}</span>
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          <div className="h-[220px] border-2 border-divider">
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
        </div>

        <div className="flex flex-col gap-5">
          <AdvanceStatus report={report} onDone={refresh} />
          <AddRemark reportId={id} onDone={refresh} />
          <UploadResolution reportId={id} status={report.status} onDone={refresh} />

          <section className="flex flex-col gap-3 border-t-2 border-divider pt-4">
            <h6>History</h6>
            {(history?.updates ?? []).length === 0 ? (
              <p className="text-muted text-[13px]">Nothing recorded yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {(history?.updates ?? []).map((update) => (
                  <li key={update.id} className="flex flex-col gap-0.5">
                    <p className="text-[13px]">
                      {update.new_status
                        ? `${update.previous_status ? `${STATUS_LABEL[update.previous_status]} → ` : ""}${STATUS_LABEL[update.new_status]}`
                        : update.update_type.replace(/[._]/g, " ")}
                    </p>
                    {update.details && <p className="text-muted text-[13px]">{update.details}</p>}
                    <p className="font-mono text-[10px] text-muted">
                      {formatDateTime(update.created_at)}
                      {update.author ? ` · ${update.author.name}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <Link to={returnTarget.to} className="btn btn-secondary self-start">
        {returnTarget.label}
      </Link>
    </div>
  );
}

// Offers the one legal next step and nothing else, so there is no way to pick an
// illegal transition and be rejected for it.
function AdvanceStatus({ report, onDone }: { report: Report; onDone: () => void }) {
  const toast = useToast();
  const [details, setDetails] = useState("");
  const next = NEXT_STATUS[report.status];
  const label = NEXT_STATUS_LABEL[report.status];

  const { run, pending, error } = useAction((body: { status: string; details?: string }) =>
    api.patch<{ report: Report }>(`/reports/${report.id}/status`, body),
  );

  if (!next || !label) {
    return (
      <section className="border-2 border-divider p-4 flex flex-col gap-2">
        <h6>Status</h6>
        <p className="text-[13px] text-muted">
          This report is {STATUS_LABEL[report.status].toLowerCase()}. There is no further step.
        </p>
      </section>
    );
  }

  return (
    <section className="border-2 border-divider p-4 flex flex-col gap-3">
      <h6>Next step</h6>
      <p className="text-[13px]">
        {STATUS_LABEL[report.status]} &rarr; <strong>{STATUS_LABEL[next]}</strong>
      </p>

      <Field
        label="Note"
        htmlFor="status-details"
        hint="Optional. The citizen sees this."
        count={details.length}
        max={500}
      >
        <Textarea
          id="status-details"
          rows={3}
          maxLength={500}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </Field>

      {error && <Alert title="Could not change the status">{error.message}</Alert>}

      <Button
        type="button"
        variant="primary"
        disabled={pending}
        onClick={async () => {
          const done = await run({ status: next, ...(details.trim() ? { details: details.trim() } : {}) });
          if (done) {
            setDetails("");
            toast(`Report is now ${STATUS_LABEL[next].toLowerCase()}.`);
            onDone();
          }
        }}
      >
        {pending ? "Saving…" : label}
      </Button>
    </section>
  );
}

// A note that does not move the report. Required, or there is nothing to record.
function AddRemark({ reportId, onDone }: { reportId: string; onDone: () => void }) {
  const toast = useToast();
  const [details, setDetails] = useState("");
  const [touched, setTouched] = useState(false);

  const { run, pending, error } = useAction((body: { details: string }) =>
    api.post<{ ok: true }>(`/reports/${reportId}/remarks`, body),
  );

  const invalid = details.trim().length === 0;

  return (
    <section className="border-2 border-divider p-4 flex flex-col gap-3">
      <h6>Add a remark</h6>

      <Field
        label="Remark"
        htmlFor="remark"
        error={touched && invalid ? "Write the remark before saving it." : undefined}
        count={details.length}
        max={500}
      >
        <Textarea
          id="remark"
          rows={3}
          maxLength={500}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </Field>

      {error && <Alert title="Could not save the remark">{error.message}</Alert>}

      <Button
        type="button"
        disabled={pending}
        onClick={async () => {
          setTouched(true);
          if (invalid) return;
          const done = await run({ details: details.trim() });
          if (done) {
            setDetails("");
            setTouched(false);
            toast("Remark saved.");
            onDone();
          }
        }}
      >
        {pending ? "Saving…" : "Save remark"}
      </Button>
    </section>
  );
}

// Proof of repair. The server decides the photo's kind from who uploads it: an
// upload by anyone other than the reporter is recorded as a resolution photo.
function UploadResolution({
  reportId,
  status,
  onDone,
}: {
  reportId: string;
  status: Report["status"];
  onDone: () => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | undefined>();

  const { run, pending, error } = useAction((formData: FormData) =>
    api.upload<{ photo: unknown }>(`/reports/${reportId}/photos`, formData),
  );

  if (status === "resolved" || status === "cancelled") return null;

  function check(candidate: File | null): string | undefined {
    if (!candidate) return "Choose a photo first.";
    if (!ALLOWED_TYPES.includes(candidate.type)) return "Photos must be JPG, PNG, or WebP.";
    if (candidate.size > MAX_PHOTO_BYTES) return "That photo is over 3 MB. Choose a smaller one.";
    return undefined;
  }

  return (
    <section className="border-2 border-divider p-4 flex flex-col gap-3">
      <h6>Upload proof of repair</h6>

      <PhotoPicker
        id="resolution-photo"
        label="Photo"
        purpose="Show the repair as it now stands. The citizen sees this on their report."
        error={localError}
        value={file}
        onChange={(chosen) => {
          setFile(chosen);
          setLocalError(chosen ? check(chosen) : undefined);
        }}
      />

      {error && <Alert title="Could not upload the photo">{error.message}</Alert>}

      <Button
        type="button"
        disabled={pending || !file || localError !== undefined}
        onClick={async () => {
          const problem = check(file);
          setLocalError(problem);
          if (problem || !file) return;

          const formData = new FormData();
          formData.set("photo", file);
          const done = await run(formData);
          if (done) {
            setFile(null);
            toast("Photo uploaded.");
            onDone();
          }
        }}
      >
        {pending ? "Uploading…" : "Upload photo"}
      </Button>
    </section>
  );
}
