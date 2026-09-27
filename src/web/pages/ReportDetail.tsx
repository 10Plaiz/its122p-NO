import { useState, useRef, useEffect } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import {
  Alert,
  Button,
  Field,
  Input,
  Loading,
  PhotoFrame,
  Select,
  StatusBadge,
  Textarea,
  formatDateTime,
  useLeftFields,
} from "../components/ui.js";
import { MapPicker } from "../components/MapPicker.js";
import type { Point } from "../components/MapPicker.js";
import { useToast } from "../components/Toast.js";
import { TILE_ATTRIBUTION, TILE_URL, pinFor, reverseGeocode } from "../lib/leaflet.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { useAction, useApi } from "../lib/useApi.js";
import { ROLE_LABEL, STATUS_LABEL } from "../lib/types.js";
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
  const canEdit =
    user?.role === "citizen" && report.citizen?.id === user.id && report.status === "pending";

  if (isEditing && canEdit) {
    return (
      <EditReport
        report={report}
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
            <StatusBadge status={report.status} />
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
                {initial.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() =>
                      setActivePhoto({
                        src: photo.url,
                        alt: `Evidence photo ${index + 1} for report ${report.reference_code}`,
                        title: `Evidence ${index + 1} · ${report.reference_code}`,
                      })
                    }
                    className="block text-left cursor-pointer p-0 bg-transparent border-0"
                    aria-label={`View evidence photo ${index + 1} in full resolution`}
                  >
                    <PhotoFrame
                      src={photo.url}
                      alt={`Evidence photo ${index + 1} for report ${report.reference_code}`}
                    />
                  </button>
                ))}
              </div>
            </section>
          )}

          {resolution.length > 0 && (
            <section className="flex flex-col gap-2 border-t border-divider pt-3">
              <h6>Proof of repair</h6>
              <div className="grid grid-cols-2 gap-2">
                {resolution.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() =>
                      setActivePhoto({
                        src: photo.url,
                        alt: `Proof of repair photo ${index + 1} for report ${report.reference_code}`,
                        title: `Proof of repair ${index + 1} · ${report.reference_code}`,
                      })
                    }
                    className="block text-left cursor-pointer p-0 bg-transparent border-0"
                    aria-label={`View proof of repair photo ${index + 1} in full resolution`}
                  >
                    <PhotoFrame
                      src={photo.url}
                      alt={`Proof of repair photo ${index + 1} for report ${report.reference_code}`}
                    />
                  </button>
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
              update.update_type.replace(/[._]/g, " ")
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

// Allows the reporting citizen to edit their pending report before staff begin handling it.
function EditReport({
  report,
  onDone,
  onCancel,
}: {
  report: Report;
  onDone: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const { data: categoryData } = useApi<{ categories: Category[] }>("/categories");

  const [title, setTitle] = useState(report.title);
  const [description, setDescription] = useState(report.description);
  const [categoryId, setCategoryId] = useState(String(report.category?.id ?? ""));
  const [address, setAddress] = useState(report.address_text ?? "");
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
        setAddress(found.slice(0, 255));
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

  function validate() {
    const errors: Record<string, string> = {};
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) errors.title = "Give the report a title of at least 3 characters.";
    if (trimmedTitle.length > 150) errors.title = "Keep the title under 150 characters.";

    const trimmedDesc = description.trim();
    if (trimmedDesc.length < 10) errors.description = "Describe the problem in at least 10 characters.";
    if (trimmedDesc.length > 1000) errors.description = "Keep the description under 1000 characters.";

    if (!categoryId) errors.category_id = "Choose the category that fits best.";
    if (address.length > 255) errors.address_text = "Keep the address under 255 characters.";
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
      description: "edit-description",
      address_text: "edit-address",
    }),
    ...(error?.fieldErrors ?? {}),
  };

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
          <Field label="Title" htmlFor="edit-title" hint="At least 3 characters." count={title.length} max={150} error={shown.title}>
            <Input
              id="edit-title"
              name="title"
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <Field label="Category" htmlFor="edit-category" error={shown.category_id}>
            <Select
              id="edit-category"
              name="category_id"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="What is wrong?"
            htmlFor="edit-description"
            hint="At least 10 characters."
            count={description.length}
            max={1000}
            error={shown.description}
          >
            <Textarea
              id="edit-description"
              name="description"
              rows={5}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <Field
            label="Address or landmark"
            htmlFor="edit-address"
            hint="Optional. Updated when the pin moves, or type your own."
            count={address.length}
            max={255}
            error={shown.address_text}
          >
            <Input
              id="edit-address"
              name="address"
              maxLength={255}
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
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

