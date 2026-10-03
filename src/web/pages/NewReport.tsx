import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { MapPicker } from "../components/MapPicker.js";
import type { Point } from "../components/MapPicker.js";
import { ALLOWED_TYPES, MAX_PHOTO_BYTES, PhotoPicker, formatFileSize, formatMimeType } from "../components/PhotoPicker.js";
import { Alert, Button, Field, Input, Select, Textarea, useLeftFields } from "../components/ui.js";
import { VoiceInput } from "../components/VoiceInput.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { reverseGeocode } from "../lib/maps.js";
import {
  ADDRESS_MAX,
  DESCRIPTION_MAX,
  NEW_REPORT_DRAFT_KEY,
  TITLE_MAX,
  isNewReportDraftEmpty,
  parseNewReportDraft,
  problemOptions,
  pinError,
  validateReportFields,
} from "../lib/report-rules.js";
import type { NewReportDraft } from "../lib/report-rules.js";
import type { ProblemTypesResponse } from "../lib/submission-types.js";
import { useDraft, useUnsavedChangesWarning } from "../lib/useDraft.js";
import { useAction, useApi } from "../lib/useApi.js";
import type { Category, Report } from "../lib/types.js";

// Wireframe 1b: location first, so the map and any GPS prompt arrive while intent is
// highest and a citizen who abandons has given up the least.

const STEPS = ["Where is it?", "What is wrong?", "Show us"] as const;

// The field rules mirror createSchema (see report-rules.ts); this only splits them
// across the wizard's steps.
function validateStep(step: number, values: Values): Record<string, string> {
  const errors: Record<string, string> = {};

  if (step === 0) {
    const outside = pinError(values.point);
    if (!values.point) errors.point = "Tap the map or use Place pin at map center.";
    // The map shows why; this keeps Continue disabled until the pin is moved.
    else if (outside) errors.point = outside;
  }

  if (step === 1) Object.assign(errors, validateReportFields(values));

  if (step === 2 && values.photo) {
    if (!ALLOWED_TYPES.includes(values.photo.type)) {
      errors.photo = "Photos must be JPG, PNG, or WebP.";
    } else if (values.photo.size > MAX_PHOTO_BYTES) {
      errors.photo = "That photo is over 3 MB. Choose a smaller one.";
    }
  }

  return errors;
}

type Values = {
  point: Point | null;
  address: string;
  title: string;
  description: string;
  categoryId: string;
  primaryId: string;
  secondaryId: string;
  photo: File | null;
};

export function NewReportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: categoryData } = useApi<{ categories: Category[] }>("/categories");
  const { data: problemData } = useApi<ProblemTypesResponse>("/reports/meta/problem-types");

  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const fields = useLeftFields();
  const [values, setValues] = useState<Values>({
    point: null,
    address: "",
    title: "",
    description: "",
    categoryId: "",
    primaryId: "",
    secondaryId: "",
    photo: null,
  });

  // Set when the address was filled by Nominatim, so a hand-typed one is never
  // overwritten by a later lookup.
  const [addressAuto, setAddressAuto] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const addressTouched = useRef(false);

  const { run, pending, error } = useAction((formData: FormData) =>
    api.upload<{ report: Report }>("/reports", formData),
  );

  // RS-5: everything but the photo is kept as a draft in this tab. The key carries
  // the citizen's id so a shared phone never offers one person's draft to the next.
  const draft: NewReportDraft = {
    version: 1,
    step,
    point: values.point,
    address: values.address,
    title: values.title,
    description: values.description,
    categoryId: values.categoryId,
    primaryId: values.primaryId,
    secondaryId: values.secondaryId,
  };
  const drafts = useDraft({
    key: user ? `${NEW_REPORT_DRAFT_KEY}.${user.id}` : null,
    value: draft,
    isEmpty: isNewReportDraftEmpty,
    parse: parseNewReportDraft,
  });
  const [submitted, setSubmitted] = useState(false);
  useUnsavedChangesWarning(!submitted && (!isNewReportDraftEmpty(draft) || values.photo !== null));

  function restoreDraft() {
    const saved = drafts.restore();
    if (!saved) return;
    // A restored address is the citizen's, whether typed or looked up, so a lookup
    // for the restored pin must not replace it.
    addressTouched.current = saved.address.trim() !== "";
    setAddressAuto(false);
    setValues((current) => ({
      ...current,
      point: saved.point,
      address: saved.address,
      title: saved.title,
      description: saved.description,
      categoryId: saved.categoryId,
      primaryId: saved.primaryId,
      secondaryId: saved.secondaryId,
    }));
    setStep(saved.step);
    setMaxStep(saved.step);
  }

  // RS-2: only the chosen category's problems, and never the main one twice.
  const primaryOptions = problemOptions(problemData?.groups, values.categoryId);
  const secondaryOptions = problemOptions(problemData?.groups, values.categoryId, { exclude: values.primaryId });
  const problemName = (id: string) => primaryOptions.find((problem) => String(problem.id) === id)?.name;

  const errors = validateStep(step, values);
  const stepInvalid = Object.keys(errors).length > 0;
  // No step past an invalid one can be reached, so Submit is only enabled once every
  // step passes. -1 when all do.
  const firstInvalid = STEPS.findIndex((_, index) => Object.keys(validateStep(index, values)).length > 0);
  // A chosen photo is checked at once: picking a file is already the finished action.
  const shown: Record<string, string> = {
    ...fields.visible(errors, { category_id: "category", address_text: "address" }),
    ...(errors.photo ? { photo: errors.photo } : {}),
    ...(error?.fieldErrors ?? {}),
  };

  // Reverse-geocode the pin into a readable address. Debounced 1000 ms because
  // Nominatim asks for no more than one request per second, and a failure is silent:
  // the field stays editable, so a rate-limited lookup costs the citizen nothing.
  useEffect(() => {
    const point = values.point;
    if (!point || addressTouched.current) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const found = await reverseGeocode(point.lat, point.lng, controller.signal);
      if (found && !addressTouched.current && !controller.signal.aborted) {
        setValues((current) => ({ ...current, address: found.slice(0, ADDRESS_MAX) }));
        setAddressAuto(true);
      }
    }, 1000);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [values.point]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError("Location access disabled. Tap the map or use Place pin at map center.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setValues((current) => ({
          ...current,
          point: { lat: position.coords.latitude, lng: position.coords.longitude },
          address: addressTouched.current ? current.address : "",
        }));
        if (!addressTouched.current) setAddressAuto(false);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setGeoError("Location access disabled. Tap the map or use Place pin at map center.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function next() {
    if (stepInvalid) return;
    const nextStep = Math.min(step + 1, STEPS.length - 1);
    setMaxStep((prev) => Math.max(prev, nextStep));
    setStep(nextStep);
  }

  function back() {
    setStep((current) => Math.max(current - 1, 0));
  }

  async function submit() {
    if (firstInvalid !== -1 || !values.point) return;

    // Multipart, because the photo rides along with the fields.
    const formData = new FormData();
    formData.set("title", values.title.trim());
    formData.set("description", values.description.trim());
    formData.set("category_id", values.categoryId);
    formData.set("latitude", String(values.point.lat));
    formData.set("longitude", String(values.point.lng));
    if (values.address.trim()) formData.set("address_text", values.address.trim());
    formData.set("primary_problem_id", values.primaryId);
    if (values.secondaryId) formData.set("secondary_problem_id", values.secondaryId);
    if (values.photo) formData.set("photo", values.photo);

    const created = await run(formData);
    if (created) {
      drafts.clear();
      setSubmitted(true);
      navigate(`/reports/${created.report.id}`, { replace: true });
    }
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6" onBlur={fields.onBlur}>
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
          Step {step + 1} of {STEPS.length}
        </span>
        <h2 aria-live="polite">{STEPS[step]}</h2>

        {/* Clickable step indicators allowing quick return to previous steps */}
        <nav aria-label="Wizard steps" className="flex items-center gap-2">
          {STEPS.map((label, index) => {
            const isCurrent = index === step;
            const isUnlocked = index <= maxStep && (firstInvalid === -1 || index <= firstInvalid);
            return (
              <button
                key={label}
                type="button"
                // The current step stays focusable and is announced; only steps not
                // reached yet, or past a step that is not complete, are disabled.
                disabled={!isUnlocked}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => {
                  if (isUnlocked && !isCurrent) setStep(index);
                }}
                className={`flex-1 text-left py-1.5 px-2 border-t-4 transition-colors ${
                  isCurrent
                    ? "border-accent cursor-default bg-surface"
                    : isUnlocked
                    ? "border-neutral-500 hover:border-accent cursor-pointer"
                    : "border-neutral-300 opacity-50 cursor-not-allowed"
                }`}
              >
                <span
                  className={`block font-mono text-[10px] uppercase tracking-wider ${
                    isCurrent
                      ? "text-accent font-bold"
                      : isUnlocked
                      ? "text-text font-semibold"
                      : "text-muted"
                  }`}
                >
                  Step {index + 1}
                </span>
                <span
                  className={`block text-[12px] font-heading truncate ${
                    isCurrent ? "font-bold text-text" : "text-muted"
                  }`}
                >
                  {label}
                </span>
                {!isUnlocked && <span className="sr-only">(not available yet)</span>}
              </button>
            );
          })}
        </nav>
      </header>

      {drafts.offer && (
        <section aria-labelledby="draft-title" className="border-2 border-accent bg-surface p-4 flex flex-col gap-3">
          <h6 id="draft-title" className="!m-0">
            You have an unfinished report
          </h6>
          <p className="text-[13px] !m-0">
            {drafts.offer.title.trim()
              ? `“${drafts.offer.title.trim()}” was saved in this tab. `
              : "A draft was saved in this tab. "}
            Photos are not kept, so attach yours again.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="primary" onClick={restoreDraft}>
              Restore draft
            </Button>
            <Button type="button" onClick={drafts.discard}>
              Discard it
            </Button>
          </div>
        </section>
      )}

      {step === 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-muted text-[13px]">
            Tap the map where the problem is, or drag the pin to adjust it. With a keyboard,
            use arrow keys to move the map, then choose Place pin at map center.
          </p>

          <div className="h-[300px] md:h-[420px] border-2 border-divider">
            <MapPicker
              value={values.point}
              onChange={(point) => {
                setGeoError(null);
                setValues((current) => ({
                  ...current,
                  point,
                  address: addressTouched.current ? current.address : "",
                }));
                if (!addressTouched.current) setAddressAuto(false);
              }}
            />
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <Button type="button" onClick={useMyLocation} disabled={locating}>
              {locating ? "Finding you…" : "Use my location"}
            </Button>
            {values.point && (
              <span
                data-testid="selected-coordinates"
                aria-live="polite"
                className="text-muted font-mono text-[11px]"
              >
                {values.point.lat.toFixed(5)}, {values.point.lng.toFixed(5)}
              </span>
            )}
          </div>

          {geoError && (
            <Alert title="Location access disabled">
              {geoError}
            </Alert>
          )}

          <Field
            label="Address"
            htmlFor="address"
            hint={
              addressAuto
                ? "Filled in from the pin. Correct it if it is wrong."
                : "Optional. A landmark helps the crew find it."
            }
            error={shown.address_text}
            count={values.address.length}
            max={ADDRESS_MAX}
          >
            <Input
              id="address"
              value={values.address}
              maxLength={ADDRESS_MAX}
              onChange={(event) => {
                addressTouched.current = true;
                setAddressAuto(false);
                setValues((current) => ({ ...current, address: event.target.value }));
              }}
            />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <Field label="Category" htmlFor="category" error={shown.category_id}>
            <Select
              id="category"
              value={values.categoryId}
              // A new category has its own problems, so earlier choices no longer apply.
              onChange={(event) =>
                setValues((current) => ({ ...current, categoryId: event.target.value, primaryId: "", secondaryId: "" }))
              }
            >
              <option value="">Choose a category</option>
              {(categoryData?.categories ?? [])
                .filter((category) => category.is_active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </Select>
          </Field>

          {values.categoryId && (
            <Field
              label="Main problem"
              htmlFor="primary-problem"
              hint="What the crew will find when they arrive."
              error={shown.primary_problem_id}
            >
              <Select
                id="primary-problem"
                value={values.primaryId}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    primaryId: event.target.value,
                    // The other problem can never be the main one.
                    secondaryId: current.secondaryId === event.target.value ? "" : current.secondaryId,
                  }))
                }
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

          {values.primaryId && secondaryOptions.length > 0 && (
            <Field
              label="Other problem"
              htmlFor="secondary-problem"
              hint="Optional. Only if there is a second problem at the same spot."
              error={shown.secondary_problem_id}
            >
              <Select
                id="secondary-problem"
                value={values.secondaryId}
                onChange={(event) => setValues((current) => ({ ...current, secondaryId: event.target.value }))}
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
            label="Title"
            htmlFor="title"
            hint="A short headline, at least 3 characters."
            error={shown.title}
            count={values.title.length}
            max={TITLE_MAX}
          >
            <Input
              id="title"
              value={values.title}
              maxLength={TITLE_MAX}
              onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            hint="What is wrong, how bad is it, and is anyone at risk? At least 10 characters."
            error={shown.description}
            count={values.description.length}
            max={DESCRIPTION_MAX}
          >
            <Textarea
              id="description"
              rows={5}
              maxLength={DESCRIPTION_MAX}
              value={values.description}
              onChange={(event) =>
                setValues((current) => ({ ...current, description: event.target.value }))
              }
            />
          </Field>

          <VoiceInput
            targetId="description"
            value={values.description}
            maxLength={DESCRIPTION_MAX}
            onChange={(description) => setValues((current) => ({ ...current, description }))}
          />
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <PhotoPicker
            id="photo"
            label="Photo"
            purpose="Optional, but a photo is the fastest way to show how bad the problem is."
            error={shown.photo}
            value={values.photo}
            onChange={(photo) => setValues((current) => ({ ...current, photo }))}
          />

          <div data-testid="preflight-summary" className="border-2 border-divider p-4 flex flex-col gap-3 bg-surface">
            <h6>Check before sending</h6>
            <Summary label="Category">
              {categoryData?.categories.find((c) => String(c.id) === values.categoryId)?.name ?? "—"}
            </Summary>
            <Summary label="Main problem">{problemName(values.primaryId) ?? "—"}</Summary>
            {values.secondaryId && <Summary label="Other problem">{problemName(values.secondaryId) ?? "—"}</Summary>}
            <Summary label="Title">{values.title || "—"}</Summary>
            <Summary label="Location">
              {values.address || (values.point ? `${values.point.lat.toFixed(5)}, ${values.point.lng.toFixed(5)}` : "—")}
            </Summary>
            <Summary label="Description">
              <p className="whitespace-pre-wrap text-[13px] text-text break-words mb-0">
                {values.description || "—"}
              </p>
            </Summary>
            <Summary label="Photo">
              {values.photo ? (
                <div className="flex items-center gap-3">
                  <PhotoThumbnail file={values.photo} />
                  <div className="flex flex-col text-[12px]">
                    <span className="font-semibold text-text truncate max-w-[220px]">{values.photo.name}</span>
                    <span className="text-muted font-mono text-[11px] flex items-center gap-1.5 pt-0.5">
                      <span>{formatFileSize(values.photo.size)}</span>
                      <span>&middot;</span>
                      <span className="tag tag-neutral text-[9px] uppercase font-mono py-0 px-1.5">
                        {formatMimeType(values.photo.type)}
                      </span>
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-muted text-[13px] italic">No photo attached</span>
              )}
            </Summary>
          </div>
        </div>
      )}

      {error && <Alert title="Could not submit">{error.message}</Alert>}

      <div className="flex flex-wrap gap-3 border-t-2 border-divider pt-4">
        {step > 0 && (
          <Button type="button" onClick={back}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button type="button" variant="primary" onClick={next} disabled={stepInvalid}>
            Continue
          </Button>
        ) : (
          <Button type="button" variant="primary" onClick={submit} disabled={pending || firstInvalid !== -1}>
            {pending ? "Submitting…" : "Submit report"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Summary({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-[13px]">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted w-24 shrink-0 pt-1">
        {label}
      </span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

function PhotoThumbnail({ file }: { file: File }) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!preview) return null;

  return (
    <img
      src={preview}
      alt={file.name}
      className="w-16 h-16 object-cover border-2 border-divider"
    />
  );
}
