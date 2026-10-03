import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ALLOWED_TYPES, MAX_PHOTO_BYTES, PhotoPicker } from "../components/PhotoPicker.js";
import { useToast } from "../components/Toast.js";
import {
  Alert,
  Button,
  DelayBadge,
  Field,
  Loading,
  PhotoFrame,
  RemovedPhoto,
  StatusBadge,
  Textarea,
  formatDateTime,
  formatDays,
  useLeftFields,
} from "../components/ui.js";
import { VerificationPanel } from "../components/VerificationPanel.js";
import { authorResidencyLabel } from "../lib/residency.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { LocationMap } from "../components/LocationMap.js";
import { FeedbackSummary } from "../components/FeedbackSummary.js";
import { getReportReturnTarget } from "../lib/navigation.js";
import { useAction, useApi } from "../lib/useApi.js";
import { NEXT_STATUS, NEXT_STATUS_LABEL, REJECTABLE_STATUSES, STATUS_LABEL, historyLabel } from "../lib/types.js";
import type { Report, ReportUpdate, ReportWorkflow } from "../lib/types.js";
import { PhotoLightbox } from "../components/PhotoLightbox.js";

const COMMENT_MAX = 500;

// Wireframe 1m: working a single report. Staff advance the status, leave remarks,
// upload proof of repair, and request resolution; an administrator opening the same
// page verifies that request. Everything here is also checked server-side by
// assertCanUpdate, changeStatus, requestClosure, and reviewClosure.
export function StaffReportPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [activePhoto, setActivePhoto] = useState<{ src: string; alt: string; title?: string } | null>(null);
  const returnTarget = getReportReturnTarget(user?.role);

  const { data, error, loading, reload } = useApi<{ report: Report }>(id ? `/reports/${id}` : null);
  const { data: history, reload: reloadHistory } = useApi<{ updates: ReportUpdate[] }>(
    id ? `/reports/${id}/updates` : null,
  );
  // Dates, delay, and any resolution request. Kept apart from the report itself
  // because the report's own fields do not carry them yet.
  const {
    data: workflowData,
    error: workflowError,
    reload: reloadWorkflow,
  } = useApi<{ workflow: ReportWorkflow }>(id ? `/reports/${id}/workflow` : null);

  function refresh() {
    reload();
    reloadHistory();
    reloadWorkflow();
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
  const workflow = workflowData?.workflow ?? null;
  // A request can wait under review (rejection) or in progress (either outcome).
  const closurePending = REJECTABLE_STATUSES.includes(report.status) && Boolean(workflow?.closure?.pending);
  const isAssignee = user?.role === "staff" && report.assigned_staff?.id === user.id;

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
            <StatusBadge status={report.status} awaitingVerification={closurePending} />
            <DelayBadge delay={workflow?.delay} />
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

          <KeyDates workflow={workflow} error={workflowError?.message} />

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
                  {/* UA-8, UA-6: staff weigh a report knowing whether its author's
                      address and number have been confirmed. */}
                  <p className="flex flex-wrap gap-1.5 !mt-1.5 !mb-0">
                    <span className={report.citizen.residency_status === "verified" ? "tag tag-outline" : "tag tag-accent"}>
                      {authorResidencyLabel(report.citizen.residency_status)}
                    </span>
                    {report.citizen.contact_number && !report.citizen.phone_verified_at && (
                      <span className="tag tag-outline">Number not verified</span>
                    )}
                  </p>
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
                  const url = photo.url;
                  if (url === null) {
                    return <RemovedPhoto key={photo.id} label={kindLabel} imageClassName="h-44" />;
                  }
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() =>
                        setActivePhoto({
                          src: url,
                          alt: `${kindLabel} photo for report ${report.reference_code}`,
                          title: `${kindLabel} (${report.reference_code})`,
                        })
                      }
                      className="flex flex-col gap-1 text-left cursor-pointer p-0 bg-transparent border-0 group"
                      aria-label={`View ${kindLabel.toLowerCase()} photo in full resolution`}
                    >
                      <PhotoFrame
                        src={url}
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
              <LocationMap
                latitude={report.latitude}
                longitude={report.longitude}
                status={report.status}
                title={`Location of ${report.title}`}
              />
            </div>
          </div>
        </section>

        {/* Right Column: Operational Tray (5 of 12 columns) */}
        <aside className="lg:col-span-5 bg-neutral-200/60 border border-divider p-4 sm:p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <h3 className="text-[14px] font-bold text-text !m-0 !normal-case tracking-normal">
              Action workbench
            </h3>
            {closurePending && workflow?.closure ? (
              user?.role === "admin" ? (
                <VerificationPanel report={report} closure={workflow.closure} onDone={refresh} />
              ) : (
                <StatusNote title="Waiting for verification">
                  {workflow.closure.requested_by?.id === user?.id
                    ? "You"
                    : (workflow.closure.requested_by?.name ?? "Staff")}{" "}
                  requested {workflow.closure.outcome === "rejected" ? "rejection" : "resolution"} on{" "}
                  {formatDateTime(workflow.closure.requested_at)}. An administrator will approve it or return it
                  with a comment.
                </StatusNote>
              )
            ) : report.status === "in_progress" ? (
              isAssignee ? (
                <RequestResolution report={report} ready={workflow !== null} onDone={refresh} />
              ) : (
                <StatusNote title="Next step">
                  {report.assigned_staff
                    ? `Waiting for ${report.assigned_staff.name} to finish the work and request resolution. You verify it here once they do.`
                    : "Assign a staff member. They request resolution when the work is done, and you verify it here."}
                </StatusNote>
              )
            ) : (
              <AdvanceStatus report={report} onDone={refresh} />
            )}
            {isAssignee && !closurePending && REJECTABLE_STATUSES.includes(report.status) && (
              <RequestRejection report={report} ready={workflow !== null} onDone={refresh} />
            )}
            <AddRemark reportId={id} onDone={refresh} />
            <UploadResolution reportId={id} status={report.status} onDone={refresh} />
          </div>

          {/* FB-1: the reporter's rating reaches the staff member (and admins). */}
          {report.status === "resolved" && (
            <div className="pt-4 border-t border-divider">
              <FeedbackSummary report={report} />
            </div>
          )}

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
                          : historyLabel(update)}
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

// A plain explanation in the workbench where there is nothing to do here.
function StatusNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-surface border border-divider p-4 flex flex-col gap-2">
      <h6 className="text-[13px] font-bold text-text !m-0 !normal-case tracking-normal">{title}</h6>
      <p className="text-[13px] text-neutral-700 !m-0">{children}</p>
    </section>
  );
}

// The dates SW-6 asks for, and how long the report has sat at its current stage.
function KeyDates({ workflow, error }: { workflow: ReportWorkflow | null; error?: string }) {
  if (error) return <Alert title="Could not load the report's dates">{error}</Alert>;
  if (!workflow) return null;

  const { delay } = workflow;
  const stage = delay.stage === "awaiting_verification" ? "awaiting verification" : STATUS_LABEL[delay.stage].toLowerCase();
  const rows: [string, string | null][] = [
    ["Submitted", workflow.submitted_at],
    ["Assigned", workflow.assigned_at],
    ["Resolution requested", workflow.closure?.requested_at ?? null],
    ["Completed", workflow.completed_at],
  ];

  return (
    <div className="flex flex-col gap-2.5 pt-4 border-t border-divider">
      <h3 className="text-[14px] font-bold text-text !m-0 !normal-case tracking-normal">Key dates</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px] !m-0">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-700">{label}</dt>
            <dd className="!m-0 font-mono text-[12px] tabular-nums">{value ? formatDateTime(value) : "Not yet"}</dd>
          </div>
        ))}
        {workflow.verified_by && (
          <div className="contents">
            <dt className="text-neutral-700">Verified by</dt>
            <dd className="!m-0 min-w-0 break-words">{workflow.verified_by.name}</dd>
          </div>
        )}
      </dl>
      {delay.threshold_days !== null && (
        <p className={`text-[13px] !m-0 ${delay.delayed ? "text-warning-800 font-semibold" : "text-neutral-700"}`}>
          {delay.delayed
            ? `Delayed: ${formatDays(delay.days)} ${stage}, ${formatDays(delay.days_over)} past the ${formatDays(delay.threshold_days)} target.`
            : `${formatDays(delay.days)} ${stage}. Target: ${formatDays(delay.threshold_days)}.`}
        </p>
      )}
    </div>
  );
}

// Offers the one legal next step and nothing else, so there is no way to pick an
// illegal transition and be rejected for it. The comment is required (SW-2).
function AdvanceStatus({ report, onDone }: { report: Report; onDone: () => void }) {
  const toast = useToast();
  const [details, setDetails] = useState("");
  const fields = useLeftFields();
  const next = NEXT_STATUS[report.status];
  const label = NEXT_STATUS_LABEL[report.status];

  const { run, pending, error } = useAction((body: { status: string; details: string }) =>
    api.patch<{ report: Report }>(`/reports/${report.id}/status`, body),
  );

  if (!next || !label) {
    return (
      <StatusNote title="Status">
        This report is {STATUS_LABEL[report.status].toLowerCase()}. There is no further step.
      </StatusNote>
    );
  }

  // Mirrors changeStatus(): work needs an assignee, who alone can request resolution.
  if (next === "in_progress" && !report.assigned_staff) {
    return (
      <StatusNote title="Next step">
        Assign a staff member before work begins. Only the assigned staff member can request resolution.
      </StatusNote>
    );
  }

  const invalid = details.trim().length === 0;
  const shown = fields.visible(invalid ? { "status-details": "Write a comment explaining the change." } : {});

  return (
    <section className="bg-surface border border-divider p-4 flex flex-col gap-3" onBlur={fields.onBlur}>
      <h6 className="text-[13px] font-bold text-text !m-0 !normal-case tracking-normal">Next step</h6>
      <p className="text-[13px] text-neutral-800 !m-0">
        {STATUS_LABEL[report.status]} &rarr; <strong>{STATUS_LABEL[next]}</strong>
      </p>

      <Field
        label="Comment"
        htmlFor="status-details"
        hint="Required. The citizen sees this."
        error={shown["status-details"] ?? error?.fieldErrors.details}
        count={details.length}
        max={COMMENT_MAX}
      >
        <Textarea
          id="status-details"
          rows={3}
          maxLength={COMMENT_MAX}
          required
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </Field>

      {error && <Alert title="Could not change the status">{error.message}</Alert>}

      <Button
        type="button"
        variant="primary"
        disabled={pending || invalid}
        onClick={async () => {
          if (invalid) return;
          const done = await run({ status: next, details: details.trim() });
          if (done) {
            setDetails("");
            fields.reset();
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

// The staff member's half of SW-4: the work is done, an administrator should check
// it. Needs proof of repair and a comment; the report stays in progress until an
// administrator approves.
function RequestResolution({ report, ready, onDone }: { report: Report; ready: boolean; onDone: () => void }) {
  const toast = useToast();
  const [details, setDetails] = useState("");
  const fields = useLeftFields();

  const { run, pending, error } = useAction((body: { outcome: "resolved"; details: string }) =>
    api.post<{ workflow: ReportWorkflow }>(`/reports/${report.id}/closure-request`, body),
  );

  const hasProof = report.photos.some((photo) => photo.kind === "resolution");
  const invalid = details.trim().length === 0;
  const shown = fields.visible(invalid ? { "closure-details": "Describe the work done." } : {});

  return (
    <section className="bg-surface border border-divider p-4 flex flex-col gap-3" onBlur={fields.onBlur}>
      <h6 className="text-[13px] font-bold text-text !m-0 !normal-case tracking-normal">Request resolution</h6>
      <p className="text-[13px] text-neutral-800 !m-0">
        An administrator checks your proof of repair, then closes the report or returns it to you.
      </p>

      {!hasProof && (
        <p className="text-[13px] text-warning-800 font-semibold !m-0" id="closure-proof-note">
          Upload at least one proof-of-repair photo below first.
        </p>
      )}

      <Field
        label="What was done"
        htmlFor="closure-details"
        hint="Required. The administrator and the citizen see this."
        error={shown["closure-details"] ?? error?.fieldErrors.details}
        count={details.length}
        max={COMMENT_MAX}
      >
        <Textarea
          id="closure-details"
          rows={3}
          maxLength={COMMENT_MAX}
          required
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </Field>

      {error && <Alert title="Could not request resolution">{error.message}</Alert>}

      <Button
        type="button"
        variant="primary"
        disabled={pending || invalid || !hasProof || !ready}
        aria-describedby={hasProof ? undefined : "closure-proof-note"}
        onClick={async () => {
          if (invalid || !hasProof) return;
          const done = await run({ outcome: "resolved", details: details.trim() });
          if (done) {
            setDetails("");
            fields.reset();
            toast("Resolution requested. An administrator will verify it.");
            onDone();
          }
        }}
      >
        {pending ? "Sending…" : "Request resolution"}
      </Button>
    </section>
  );
}

// SW-7: the staff member on the report says it cannot be fixed. Only the reason is
// needed, no proof photo; an administrator approves or returns the request. Once
// approved, the reason is shown on the public board, and the form says so.
function RequestRejection({ report, ready, onDone }: { report: Report; ready: boolean; onDone: () => void }) {
  const toast = useToast();
  const [details, setDetails] = useState("");
  const fields = useLeftFields();

  const { run, pending, error } = useAction((body: { outcome: "rejected"; details: string }) =>
    api.post<{ workflow: ReportWorkflow }>(`/reports/${report.id}/closure-request`, body),
  );

  const invalid = details.trim().length === 0;
  const shown = fields.visible(invalid ? { "rejection-details": "Explain why the report cannot be fixed." } : {});

  return (
    <section className="bg-surface border border-divider p-4 flex flex-col gap-3" onBlur={fields.onBlur}>
      <h6 className="text-[13px] font-bold text-text !m-0 !normal-case tracking-normal">Request rejection</h6>
      <p className="text-[13px] text-neutral-800 !m-0">
        If this report cannot be fixed, for example because it is on private property or outside the city&rsquo;s
        responsibility, ask an administrator to close it as rejected.
      </p>

      <Field
        label="Reason"
        htmlFor="rejection-details"
        hint="Required. The citizen, administrators, and the public board see this."
        error={shown["rejection-details"] ?? error?.fieldErrors.details}
        count={details.length}
        max={COMMENT_MAX}
      >
        <Textarea
          id="rejection-details"
          rows={3}
          maxLength={COMMENT_MAX}
          required
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </Field>

      {error && <Alert title="Could not request rejection">{error.message}</Alert>}

      <Button
        type="button"
        disabled={pending || invalid || !ready}
        onClick={async () => {
          if (invalid) return;
          const done = await run({ outcome: "rejected", details: details.trim() });
          if (done) {
            setDetails("");
            fields.reset();
            toast("Rejection requested. An administrator will verify it.");
            onDone();
          }
        }}
      >
        {pending ? "Sending…" : "Request rejection"}
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

  if (status === "resolved" || status === "cancelled" || status === "rejected") return null;

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
