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
  useLeftFields,
} from "../components/ui.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { TILE_ATTRIBUTION, TILE_URL, pinFor } from "../lib/leaflet.js";
import { getReportReturnTarget } from "../lib/navigation.js";
import { useAction, useApi } from "../lib/useApi.js";
import { NEXT_STATUS, NEXT_STATUS_LABEL, STATUS_LABEL } from "../lib/types.js";
import type { Report, ReportUpdate } from "../lib/types.js";
import { PhotoLightbox } from "../components/PhotoLightbox.js";

// Wireframe 1m: working a single report. Staff advance the status, leave remarks and
// upload proof of repair. Everything here is also checked server-side by
// assertCanUpdate and changeStatus.
export function StaffReportPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [activePhoto, setActivePhoto] = useState<{ src: string; alt: string; title?: string } | null>(null);
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
      {/* Zone 1: Consolidated Hero Header */}
      <header className="flex flex-col gap-2 pb-5 border-b border-divider">
        <div className="flex items-center justify-between gap-4">
          <Link
            to={returnTarget.to}
            className="inline-flex items-center gap-1.5 text-[12px] font-mono font-semibold text-neutral-700 hover:text-text transition-colors"
          >
            <span aria-hidden="true">&larr;</span> {returnTarget.label}
          </Link>
        </div>

        <div className="flex flex-col">
          <h2 className="text-[28px] sm:text-[32px] font-bold text-text leading-tight !m-0 !mb-0 text-balance">
            {report.title}
          </h2>
          {report.address_text && (
            <p className="text-[13px] sm:text-[14px] font-medium text-neutral-700 !m-0 !mt-1">
              {report.address_text}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="tag tag-outline text-[12px] font-semibold tracking-wide">
              {report.category?.name ?? "Uncategorised"}
            </span>
            <StatusBadge status={report.status} />
            <span className="font-mono text-[11px] bg-neutral-200 px-2 py-0.5 border border-divider text-neutral-800">
              {report.reference_code}
            </span>
          </div>

          <time className="text-[12px] font-medium text-neutral-700 font-mono">
            Filed {formatDateTime(report.submitted_at)}
          </time>
        </div>
      </header>

      {/* Zone 2: Two-Tone Split Canvas */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Read Dossier (7 of 12 columns) */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h3 className="text-[15px] font-bold text-text !m-0 !normal-case tracking-normal">
              Report details
            </h3>
            <p className="text-[14px] leading-relaxed text-text select-text cursor-text whitespace-pre-line !m-0">
              {report.description}
            </p>
          </div>

          {/* Reporter information */}
          {report.citizen && (
            <div className="flex flex-col gap-2.5 pt-4 border-t border-divider">
              <h3 className="text-[14px] font-bold text-text !m-0 !normal-case tracking-normal">
                Reporter information
              </h3>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[13px] font-semibold text-text !m-0">{report.citizen.name}</p>
                  <p className="text-[12px] text-neutral-600 font-mono !m-0">{report.citizen.email}</p>
                </div>
                {report.citizen.contact_number && (
                  <a
                    href={`tel:${report.citizen.contact_number.replace(/[^\d+]/g, "")}`}
                    className="btn btn-secondary text-[12px] py-1.5 px-3 min-h-[36px]"
                    aria-label={`Call citizen at ${report.citizen.contact_number}`}
                  >
                    Call {report.citizen.contact_number}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Photo evidence */}
          {report.photos.length > 0 && (
            <div className="flex flex-col gap-3 pt-4 border-t border-divider">
              <h3 className="text-[14px] font-bold text-text !m-0 !normal-case tracking-normal">
                Photo evidence
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {report.photos.map((photo) => {
                  const kindLabel = photo.kind === "resolution" ? "Proof of repair" : "Evidence";
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() =>
                        setActivePhoto({
                          src: photo.url,
                          alt: `${kindLabel} photo for report ${report.reference_code}`,
                          title: `${kindLabel} (${report.reference_code})`,
                        })
                      }
                      className="flex flex-col gap-1 text-left cursor-pointer p-0 bg-transparent border-0 group"
                      aria-label={`View ${kindLabel.toLowerCase()} photo in full resolution`}
                    >
                      <PhotoFrame
                        src={photo.url}
                        alt={`${kindLabel} photo for report ${report.reference_code}`}
                        imageClassName="h-44 w-full object-cover group-hover:opacity-90 transition-opacity"
                      />
                      <span className="font-mono text-[10px] font-medium text-neutral-600">
                        {kindLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Location map */}
          <div className="flex flex-col gap-2.5 pt-4 border-t border-divider">
            <h3 className="text-[14px] font-bold text-text !m-0 !normal-case tracking-normal">
              Location map
            </h3>
            <div className="h-[260px] border border-divider">
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
        </section>

        {/* Right Column: Operational Tray (5 of 12 columns) */}
        <aside className="lg:col-span-5 bg-neutral-200/60 border border-divider p-4 sm:p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <h3 className="text-[14px] font-bold text-text !m-0 !normal-case tracking-normal">
              Action workbench
            </h3>
            <AdvanceStatus report={report} onDone={refresh} />
            <AddRemark reportId={id} onDone={refresh} />
            <UploadResolution reportId={id} status={report.status} onDone={refresh} />
          </div>

          <section className="flex flex-col gap-3 pt-4 border-t border-divider">
            <h6 className="text-[14px] font-bold text-text !m-0 !normal-case tracking-normal">History</h6>
            {(history?.updates ?? []).length === 0 ? (
              <p className="text-neutral-600 text-[13px] !m-0">Nothing recorded yet.</p>
            ) : (
              <ol className="flex flex-col gap-3 relative before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-[2px] before:bg-divider list-none !p-0 !m-0">
                {(history?.updates ?? []).map((update) => (
                  <li key={update.id} className="relative pl-6 flex flex-col gap-1">
                    <span
                      className="absolute left-0 top-1.5 size-3.5 border-2 border-surface bg-neutral-600 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold text-text leading-snug">
                        {update.new_status
                          ? `${update.previous_status ? `${STATUS_LABEL[update.previous_status]} → ` : ""}${STATUS_LABEL[update.new_status]}`
                          : update.update_type.replace(/[._]/g, " ")}
                      </span>
                    </div>
                    {update.details && (
                      <p className="text-[13px] text-neutral-800 bg-surface/80 border border-divider/60 p-2 leading-relaxed !m-0">
                        {update.details}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-neutral-600 font-mono text-[11px] flex-wrap">
                      <time>{formatDateTime(update.created_at)}</time>
                      {update.author && (
                        <span className="text-neutral-700 font-medium">({update.author.name})</span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      {activePhoto && (
        <PhotoLightbox
          src={activePhoto.src}
          alt={activePhoto.alt}
          title={activePhoto.title}
          onClose={() => setActivePhoto(null)}
        />
      )}
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
      <section className="bg-surface border border-divider p-4 flex flex-col gap-2">
        <h6 className="text-[13px] font-bold text-text !m-0 !normal-case tracking-normal">Status</h6>
        <p className="text-[13px] text-neutral-700 !m-0">
          This report is {STATUS_LABEL[report.status].toLowerCase()}. There is no further step.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-surface border border-divider p-4 flex flex-col gap-3">
      <h6 className="text-[13px] font-bold text-text !m-0 !normal-case tracking-normal">Next step</h6>
      <p className="text-[13px] text-neutral-800 !m-0">
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
  const fields = useLeftFields();

  const { run, pending, error } = useAction((body: { details: string }) =>
    api.post<{ ok: true }>(`/reports/${reportId}/remarks`, body),
  );

  const invalid = details.trim().length === 0;
  const shown = fields.visible(invalid ? { remark: "Write the remark before saving it." } : {});

  return (
    <section className="bg-surface border border-divider p-4 flex flex-col gap-3" onBlur={fields.onBlur}>
      <h6 className="text-[13px] font-bold text-text !m-0 !normal-case tracking-normal">Add a remark</h6>

      <Field
        label="Remark"
        htmlFor="remark"
        error={shown.remark}
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
        disabled={pending || invalid}
        onClick={async () => {
          if (invalid) return;
          const done = await run({ details: details.trim() });
          if (done) {
            setDetails("");
            fields.reset();
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
    <section className="bg-surface border border-divider p-4 flex flex-col gap-3">
      <h6 className="text-[13px] font-bold text-text !m-0 !normal-case tracking-normal">Upload proof of repair</h6>

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
