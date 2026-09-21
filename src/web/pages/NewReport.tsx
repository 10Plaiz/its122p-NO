import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { MapPicker } from "../components/MapPicker.js";
import type { Point } from "../components/MapPicker.js";
import { ALLOWED_TYPES, MAX_PHOTO_BYTES, PhotoPicker } from "../components/PhotoPicker.js";
import { Alert, Button, Field, Input, Select, Textarea } from "../components/ui.js";
import { api } from "../lib/api.js";
import { reverseGeocode } from "../lib/leaflet.js";
import { useAction, useApi } from "../lib/useApi.js";
import type { Category, Report } from "../lib/types.js";

// Wireframe 1b: location first, so the map and any GPS prompt arrive while intent is
// highest and a citizen who abandons has given up the least.

const STEPS = ["Where is it?", "What is wrong?", "Show us"] as const;

// Mirrors createSchema in src/server/routes/reports.routes.ts, message for message.
function validateStep(step: number, values: Values): Record<string, string> {
  const errors: Record<string, string> = {};

  if (step === 0 && !values.point) {
    errors.point = "Tap the map to drop a pin where the problem is.";
  }

  if (step === 1) {
    const title = values.title.trim();
    if (title.length < 3) errors.title = "Give the report a title of at least 3 characters.";
    if (title.length > 150) errors.title = "Keep the title under 150 characters.";
    const description = values.description.trim();
    if (description.length < 10) {
      errors.description = "Describe the problem in at least 10 characters.";
    }
    if (description.length > 1000) errors.description = "Keep the description under 1000 characters.";
    if (!values.categoryId) errors.category_id = "Choose the category that fits best.";
    if (values.address.length > 255) errors.address_text = "Keep the address under 255 characters.";
  }

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
  photo: File | null;
};

export function NewReportPage() {
  const navigate = useNavigate();
  const { data: categoryData } = useApi<{ categories: Category[] }>("/categories");

  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);
  const [values, setValues] = useState<Values>({
    point: null,
    address: "",
    title: "",
    description: "",
    categoryId: "",
    photo: null,
  });

  // Set when the address was filled by Nominatim, so a hand-typed one is never
  // overwritten by a later lookup.
  const [addressAuto, setAddressAuto] = useState(false);
  const [locating, setLocating] = useState(false);
  const addressTouched = useRef(false);

  const { run, pending, error } = useAction((formData: FormData) =>
    api.upload<{ report: Report }>("/reports", formData),
  );

  const errors = validateStep(step, values);
  const shown = { ...(touched ? errors : {}), ...(error?.fieldErrors ?? {}) };

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
        setValues((current) => ({ ...current, address: found.slice(0, 255) }));
        setAddressAuto(true);
      }
    }, 1000);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [values.point]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setValues((current) => ({
          ...current,
          point: { lat: position.coords.latitude, lng: position.coords.longitude },
        }));
        setLocating(false);
      },
      // Denied or unavailable is not an error worth interrupting for — the map is
      // still there to tap.
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function next() {
    setTouched(true);
    if (Object.keys(validateStep(step, values)).length > 0) return;
    setTouched(false);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function back() {
    setTouched(false);
    setStep((current) => Math.max(current - 1, 0));
  }

  async function submit() {
    setTouched(true);

    // Re-check every step, not just the last — someone can reach step 3 and then
    // clear a field by going back.
    for (let index = 0; index < STEPS.length; index += 1) {
      const stepErrors = validateStep(index, values);
      if (Object.keys(stepErrors).length > 0) {
        setStep(index);
        return;
      }
    }
    if (!values.point) return;

    // Multipart, because the photo rides along with the fields.
    const formData = new FormData();
    formData.set("title", values.title.trim());
    formData.set("description", values.description.trim());
    formData.set("category_id", values.categoryId);
    formData.set("latitude", String(values.point.lat));
    formData.set("longitude", String(values.point.lng));
    if (values.address.trim()) formData.set("address_text", values.address.trim());
    if (values.photo) formData.set("photo", values.photo);

    const created = await run(formData);
    if (created) navigate(`/reports/${created.report.id}`, { replace: true });
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
          Step {step + 1} of {STEPS.length}
        </span>
        <h2>{STEPS[step]}</h2>

        {/* Progress as filled rules — zero radius, like everything else. */}
        <div className="flex gap-1" role="presentation">
          {STEPS.map((label, index) => (
            <span
              key={label}
              className={index <= step ? "h-1 flex-1 bg-accent" : "h-1 flex-1 bg-neutral-300"}
            />
          ))}
        </div>
      </header>

      {step === 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-muted text-[13px]">
            Tap the map where the problem is, or drag the pin to adjust it.
          </p>

          <div className="h-[300px] md:h-[420px] border-2 border-divider">
            <MapPicker
              value={values.point}
              onChange={(point) => setValues((current) => ({ ...current, point }))}
            />
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <Button type="button" onClick={useMyLocation} disabled={locating}>
              {locating ? "Finding you…" : "Use my location"}
            </Button>
            {values.point && (
              <span className="text-muted font-mono text-[11px]">
                {values.point.lat.toFixed(5)}, {values.point.lng.toFixed(5)}
              </span>
            )}
          </div>

          {shown.point && (
            <span role="alert" className="text-[11px] text-accent-700">
              {shown.point}
            </span>
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
            max={255}
          >
            <Input
              id="address"
              value={values.address}
              maxLength={255}
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
              onChange={(event) => setValues((current) => ({ ...current, categoryId: event.target.value }))}
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

          <Field
            label="Title"
            htmlFor="title"
            hint="A short summary, like a headline."
            error={shown.title}
            count={values.title.length}
            max={150}
          >
            <Input
              id="title"
              value={values.title}
              maxLength={150}
              onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            hint="What is wrong, how bad is it, and is anyone at risk?"
            error={shown.description}
            count={values.description.length}
            max={1000}
          >
            <Textarea
              id="description"
              rows={5}
              maxLength={1000}
              value={values.description}
              onChange={(event) =>
                setValues((current) => ({ ...current, description: event.target.value }))
              }
            />
          </Field>
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

          <div className="border-2 border-divider p-4 flex flex-col gap-2">
            <h6>Check before sending</h6>
            <Summary label="Category">
              {categoryData?.categories.find((c) => String(c.id) === values.categoryId)?.name ?? "—"}
            </Summary>
            <Summary label="Title">{values.title || "—"}</Summary>
            <Summary label="Location">
              {values.address || (values.point ? `${values.point.lat.toFixed(5)}, ${values.point.lng.toFixed(5)}` : "—")}
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
          <Button type="button" variant="primary" onClick={next}>
            Continue
          </Button>
        ) : (
          <Button type="button" variant="primary" onClick={submit} disabled={pending}>
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
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted w-20 shrink-0 pt-1">
        {label}
      </span>
      <span className="flex-1">{children}</span>
    </div>
  );
}
