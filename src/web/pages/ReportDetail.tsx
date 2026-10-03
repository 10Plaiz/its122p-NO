import { useState, useRef, useEffect } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Field,
  Input,
  Loading,
  PhotoFrame,
  RemovedPhoto,
  Select,
  StatusBadge,
  Textarea,
  formatDateTime,
  useLeftFields,
} from "../components/ui.js";
import { MapPicker } from "../components/MapPicker.js";
import type { Point } from "../components/MapPicker.js";
import { useToast } from "../components/Toast.js";
import { VoiceInput } from "../components/VoiceInput.js";
import { reverseGeocode } from "../lib/maps.js";
import { LocationMap } from "../components/LocationMap.js";
import { FeedbackForm } from "../components/FeedbackForm.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import {
  ADDRESS_MAX,
  DESCRIPTION_MAX,
  PRIMARY_PROBLEM_AGAIN_ERROR,
  PRIMARY_PROBLEM_ERROR,
  TITLE_MAX,
  problemOptions,
  pinError,
  validateReportFields,
} from "../lib/report-rules.js";
import type { ProblemTypesResponse, ReportProblems } from "../lib/submission-types.js";
import { useUnsavedChangesWarning } from "../lib/useDraft.js";
import { useAction, useApi } from "../lib/useApi.js";
import { ROLE_LABEL, STATUS_LABEL, closurePendingOf, historyLabel } from "../lib/types.js";
import type { Category, Report, ReportUpdate } from "../lib/types.js";
import { getReportReturnTarget } from "../lib/navigation.js";
import { PhotoLightbox } from "../components/PhotoLightbox.js";

// Wireframe 1j. Visible to the report's owner, to assigned staff and to admins:
// assertCanView decides, so an id guessed from the URL returns 403 rather than data.
export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
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

  if (!data) return null;

  const report = data.report;
  const isOwner = user?.role === "citizen" && report.citizen?.id === user.id;
  const canEdit = isOwner && report.status === "pending";
  const problems: ReportProblems = { primary: report.primary_problem, secondary: report.secondary_problem };

  if (isEditing && canEdit) {
    return (
      <EditReport
        report={report}
        problems={problems}
        onDone={() => {
          refresh();
          setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  const initial = report.photos.filter((photo) => photo.kind === "initial");
  const resolution = report.photos.filter((photo) => photo.kind === "resolution");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="font-mono text-[11px] text-muted">{report.reference_code}</span>
          <div className="flex items-center gap-2">
            <StatusBadge status={report.status} awaitingVerification={closurePendingOf(report)} />
            {canEdit && (
              <Button type="button" variant="secondary" onClick={() => setIsEditing(true)}>
                Edit report
              </Button>
            )}
          </div>
        </div>
        <h2>{report.title}</h2>
        <p className="text-muted font-mono text-[11px]">
          {report.category?.name ?? "Uncategorised"} &middot; filed {formatDateTime(report.submitted_at)}
          {report.resolved_at ? ` · resolved ${formatDateTime(report.resolved_at)}` : ""}
          {report.status === "rejected" && report.verified_at ? ` · closed ${formatDateTime(report.verified_at)}` : ""}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h6>What was reported</h6>
            {problems.primary && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] !m-0">
                <dt className="text-muted">Main problem</dt>
                <dd className="!m-0">{problems.primary.name}</dd>
                {problems.secondary && (
                  <>
                    <dt className="text-muted">Other problem</dt>
                    <dd className="!m-0">{problems.secondary.name}</dd>
                  </>
                )}
              </dl>
            )}
            <p className="text-[14px] whitespace-pre-line">{report.description}</p>
            {report.address_text && <p className="text-muted text-[13px]">{report.address_text}</p>}
          </section>

          {/* SW-7: the citizen reads why their report was closed without a repair. */}
          {report.status === "rejected" && report.closure_reason && (
            <section className="flex flex-col gap-1 border-t border-divider pt-3">
              <h6>Why it was rejected</h6>
              <p className="text-[14px] whitespace-pre-line break-words !m-0">{report.closure_reason}</p>
            </section>
          )}

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
                {initial.map(({ url, ...photo }, index) =>
                  url === null ? (
                    <RemovedPhoto key={photo.id} label={`Evidence ${index + 1}`} />
                  ) : (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() =>
                        setActivePhoto({
                          src: url,
                          alt: `Evidence photo ${index + 1} for report ${report.reference_code}`,
                          title: `Evidence ${index + 1} · ${report.reference_code}`,
                        })
                      }
                      className="block text-left cursor-pointer p-0 bg-transparent border-0"
                      aria-label={`View evidence photo ${index + 1} in full resolution`}
                    >
                      <PhotoFrame
                        src={url}
                        alt={`Evidence photo ${index + 1} for report ${report.reference_code}`}
                      />
                    </button>
                  ),
                )}
              </div>
            </section>
          )}

          {resolution.length > 0 && (
            <section className="flex flex-col gap-2 border-t border-divider pt-3">
              <h6>Proof of repair</h6>
              <div className="grid grid-cols-2 gap-2">
                {resolution.map(({ url, ...photo }, index) =>
                  url === null ? (
                    <RemovedPhoto key={photo.id} label={`Proof of repair ${index + 1}`} />
                  ) : (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() =>
                        setActivePhoto({
                          src: url,
                          alt: `Proof of repair photo ${index + 1} for report ${report.reference_code}`,
                          title: `Proof of repair ${index + 1} · ${report.reference_code}`,
                        })
                      }
                      className="block text-left cursor-pointer p-0 bg-transparent border-0"
                      aria-label={`View proof of repair photo ${index + 1} in full resolution`}
                    >
                      <PhotoFrame
                        src={url}
                        alt={`Proof of repair photo ${index + 1} for report ${report.reference_code}`}
                      />
                    </button>
                  ),
                )}
              </div>
            </section>
          )}

          {/* FB-1: only the reporter rates, and only a resolved report. */}
          {isOwner && <FeedbackForm report={report} />}
        </div>

        <div className="flex flex-col gap-4">
          <div className="h-[260px] border-2 border-divider">
            <LocationMap
              latitude={report.latitude}
              longitude={report.longitude}
              status={report.status}
              title={`Location of ${report.title}`}
            />
          </div>

          <section className="flex flex-col gap-3">
            <h6>History</h6>
            <Timeline updates={history?.updates ?? []} />
            {isOwner && <ReportComment reportId={report.id} onDone={reloadHistory} />}
          </section>
        </div>
      </div>

      <Link to={returnTarget.to} className="btn btn-secondary self-start">
        {returnTarget.label}
      </Link>

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
              historyLabel(update)
            )}
          </p>
          {update.details && <p className="text-[13px] text-muted pt-0.5">{update.details}</p>}
          <p className="font-mono text-[10px] text-muted pt-1">
            {formatDateTime(update.created_at)}
            {update.author ? ` · ${update.author.name} (${ROLE_LABEL[update.author.role] ?? update.author.role})` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

// RS-6: the reporter can add a comment at any status, such as "the water is
// rising again" after it was resolved. It goes into the history and reaches the
// assigned staff member and the administrators. Ten an hour (the server says so).
const COMMENT_MAX = 500;

function ReportComment({ reportId, onDone }: { reportId: string; onDone: () => void }) {
  const toast = useToast();
  const [details, setDetails] = useState("");
  const fields = useLeftFields();

  const { run, pending, error } = useAction((body: { details: string }) =>
    api.post<{ ok: true }>(`/reports/${reportId}/remarks`, body),
  );

  const invalid = details.trim().length === 0;
  const shown = fields.visible(invalid ? { "report-comment": "Write your comment before sending it." } : {});

  return (
    <form
      className="flex flex-col gap-3 border-t border-divider pt-3"
      onBlur={fields.onBlur}
      onSubmit={async (event) => {
        event.preventDefault();
        if (invalid) return;
        const done = await run({ details: details.trim() });
        if (done) {
          setDetails("");
          fields.reset();
          toast("Comment sent. Staff and administrators will see it in the history.");
          onDone();
        }
      }}
    >
      <Field
        label="Add a comment"
        htmlFor="report-comment"
        hint="Staff and administrators read this. It is added to the history above."
        error={shown["report-comment"] ?? error?.fieldErrors.details}
        count={details.length}
        max={COMMENT_MAX}
      >
        <Textarea
          id="report-comment"
          name="comment"
          rows={3}
          maxLength={COMMENT_MAX}
          autoComplete="off"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </Field>

      {error && !error.fieldErrors.details && <Alert title="Could not send the comment">{error.message}</Alert>}

      <Button type="submit" className="self-start" disabled={pending || invalid}>
        {pending ? "Sending…" : "Send comment"}
      </Button>
    </form>
  );
}

// Allows the reporting citizen to edit their pending report before staff begin handling it.
function EditReport({
  report,
  problems,
  onDone,
  onCancel,
}: {
  report: Report;
  problems: ReportProblems;
  onDone: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const { data: categoryData } = useApi<{ categories: Category[] }>("/categories");
  const { data: problemTypeData } = useApi<ProblemTypesResponse>("/reports/meta/problem-types");

  const [title, setTitle] = useState(report.title);
  const [description, setDescription] = useState(report.description);
  const [categoryId, setCategoryId] = useState(String(report.category?.id ?? ""));
  const [address, setAddress] = useState(report.address_text ?? "");
  const savedPrimary = problems.primary ? String(problems.primary.id) : "";
  const savedSecondary = problems.secondary ? String(problems.secondary.id) : "";
  const [primaryId, setPrimaryId] = useState(savedPrimary);
  const [secondaryId, setSecondaryId] = useState(savedSecondary);
  const [point, setPoint] = useState<Point>({ lat: report.latitude, lng: report.longitude });
  const [locating, setLocating] = useState(false);
  const fields = useLeftFields();

  const pointChangedByUser = useRef(false);
  const addressTouched = useRef(false);

  function handlePointChange(newPoint: Point) {
    pointChangedByUser.current = true;
    setPoint(newPoint);
  }

  // Reverse-geocode when the user adjusts the pin location on the map.
  useEffect(() => {
    if (!point || !pointChangedByUser.current || addressTouched.current) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const found = await reverseGeocode(point.lat, point.lng, controller.signal);
      if (found && !addressTouched.current) {
        setAddress(found.slice(0, ADDRESS_MAX));
      }
    }, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [point]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        handlePointChange({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000, enableHighAccuracy: true },
    );
  }

  const { run, pending, error } = useAction((changes: Record<string, unknown>) =>
    api.patch<{ report: Report }>(`/reports/${report.id}`, changes),
  );

  const categoryChanged = Number(categoryId) !== report.category?.id;

  // Mirrors editSchema: a new category needs a new main problem; a report filed
  // before problem types existed may keep none while its category stays the same.
  function validate() {
    const primaryMessage = categoryChanged
      ? PRIMARY_PROBLEM_AGAIN_ERROR
      : savedPrimary
        ? PRIMARY_PROBLEM_ERROR
        : null;
    const errors = validateReportFields({ title, description, categoryId, address, primaryId, secondaryId }, primaryMessage);
    // Only a moved pin is checked, like editSchema. The map shows the reason.
    const outside = pointChangedByUser.current ? pinError(point) : undefined;
    if (outside) errors.latitude = outside;
    return errors;
  }

  // Only what differs from the saved report is sent.
  function changedFields() {
    const changes: Record<string, unknown> = {};
    if (title.trim() !== report.title) changes.title = title.trim();
    if (description.trim() !== report.description) changes.description = description.trim();
    if (Number(categoryId) !== report.category?.id) changes.category_id = Number(categoryId);
    if (
      pointChangedByUser.current &&
      (point.lat !== report.latitude || point.lng !== report.longitude)
    ) {
      changes.latitude = point.lat;
      changes.longitude = point.lng;
    }
    const cleanAddress = address.trim();
    if (cleanAddress !== (report.address_text ?? "")) {
      changes.address_text = cleanAddress || null;
    }
    if (primaryId !== savedPrimary || categoryChanged) changes.primary_problem_id = Number(primaryId);
    if (secondaryId !== savedSecondary) changes.secondary_problem_id = secondaryId ? Number(secondaryId) : null;
    return changes;
  }

  const errors = validate();
  const changes = changedFields();
  // Same rule as every other form: Save is disabled while invalid or unchanged.
  const invalid = Object.keys(errors).length > 0;
  const unchanged = Object.keys(changes).length === 0;
  const shown = {
    ...fields.visible(errors, {
      title: "edit-title",
      category_id: "edit-category",
      primary_problem_id: "edit-primary-problem",
      secondary_problem_id: "edit-secondary-problem",
      description: "edit-description",
      address_text: "edit-address",
    }),
    ...(error?.fieldErrors ?? {}),
  };

  // RS-5: closing the tab or reloading with unsaved edits asks first.
  useUnsavedChangesWarning(!unchanged && !pending);

  function cancelEditing() {
    if (!unchanged && !window.confirm("Discard your changes to this report?")) return;
    onCancel();
  }

  // RS-2: the category's own problems. A saved problem that has since been retired
  // stays listed while the category is unchanged, so the form shows what is saved.
  const primaryOptions = problemOptions(problemTypeData?.groups, categoryId, {
    keep: categoryChanged ? null : problems.primary,
  });
  const secondaryOptions = problemOptions(problemTypeData?.groups, categoryId, {
    exclude: primaryId,
    keep: categoryChanged ? null : problems.secondary,
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (invalid || unchanged) return;

    const updated = await run(changes);
    if (updated) {
      toast("Report updated.");
      onDone();
    }
  }

  const categories =
    categoryData?.categories.filter((c) => c.is_active || c.id === report.category?.id) ?? [];

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit} onBlur={fields.onBlur} noValidate>
      <header className="flex flex-col gap-1 border-b border-divider pb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="font-mono text-[11px] text-muted">Editing {report.reference_code}</span>
          <StatusBadge status={report.status} />
        </div>
        <h3>Edit pending report</h3>
        <p className="text-muted text-[13px]">
          You can update details or adjust the map location while this report is still pending review.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Field label="Title" htmlFor="edit-title" hint="At least 3 characters." count={title.length} max={TITLE_MAX} error={shown.title}>
            <Input
              id="edit-title"
              name="title"
              maxLength={TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <Field label="Category" htmlFor="edit-category" error={shown.category_id}>
            <Select
              id="edit-category"
              name="category_id"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                // A new category has its own problems; going back restores the saved ones.
                const back = Number(e.target.value) === report.category?.id;
                setPrimaryId(back ? savedPrimary : "");
                setSecondaryId(back ? savedSecondary : "");
              }}
            >
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          {categoryId && (
            <Field
              label="Main problem"
              htmlFor="edit-primary-problem"
              hint={categoryChanged ? "Required for the new category." : undefined}
              error={shown.primary_problem_id}
            >
              <Select
                id="edit-primary-problem"
                name="primary_problem_id"
                value={primaryId}
                onChange={(e) => {
                  setPrimaryId(e.target.value);
                  if (secondaryId === e.target.value) setSecondaryId("");
                }}
              >
                <option value="">Choose the main problem</option>
                {primaryOptions.map((problem) => (
                  <option key={problem.id} value={problem.id}>
                    {problem.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {primaryId && secondaryOptions.length > 0 && (
            <Field
              label="Other problem"
              htmlFor="edit-secondary-problem"
              hint="Optional."
              error={shown.secondary_problem_id}
            >
              <Select
                id="edit-secondary-problem"
                name="secondary_problem_id"
                value={secondaryId}
                onChange={(e) => setSecondaryId(e.target.value)}
              >
                <option value="">None</option>
                {secondaryOptions.map((problem) => (
                  <option key={problem.id} value={problem.id}>
                    {problem.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field
            label="What is wrong?"
            htmlFor="edit-description"
            hint="At least 10 characters."
            count={description.length}
            max={DESCRIPTION_MAX}
            error={shown.description}
          >
            <Textarea
              id="edit-description"
              name="description"
              rows={5}
              maxLength={DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <VoiceInput
            targetId="edit-description"
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={setDescription}
          />

          <Field
            label="Address or landmark"
            htmlFor="edit-address"
            hint="Optional. Updated when the pin moves, or type your own."
            count={address.length}
            max={ADDRESS_MAX}
            error={shown.address_text}
          >
            <Input
              id="edit-address"
              name="address"
              maxLength={ADDRESS_MAX}
              value={address}
              onChange={(e) => {
                addressTouched.current = true;
                setAddress(e.target.value);
              }}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-[13px]">Pin location</span>
            {"geolocation" in navigator && (
              <Button type="button" variant="ghost" disabled={locating} onClick={useMyLocation}>
                {locating ? "Finding location…" : "Use my location"}
              </Button>
            )}
          </div>
          <div className="h-[300px] border-2 border-divider">
            <MapPicker value={point} onChange={handlePointChange} />
          </div>
          <p className="text-muted text-[11px] font-mono">
            {point.lat.toFixed(5)}, {point.lng.toFixed(5)} (drag or tap to adjust)
          </p>
        </div>
      </div>

      {error && <Alert title="Could not update report">{error.message}</Alert>}

      <div className="flex items-center gap-3 pt-2 border-t border-divider">
        <Button type="submit" variant="primary" disabled={pending || invalid || unchanged}>
          {pending ? "Saving changes…" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={cancelEditing}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

