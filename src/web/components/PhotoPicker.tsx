import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Button, Field, PhotoFrame } from "./ui.js";

// The one photo control, shared by the citizen's report wizard and the staff
// proof-of-repair panel. Both limits mirror photoUpload in src/server/lib/photos.ts —
// the server rejects anything past them either way, so checking here only saves the
// citizen a wasted upload over a phone connection.
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const UNITS = ["B", "KB", "MB"] as const;

function formatSize(bytes: number) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const number = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: unit > 0 && value < 10 ? 1 : 0,
  }).format(value);

  // Non-breaking space: a size must never wrap away from its unit.
  return `${number}\u00a0${UNITS[unit]}`;
}

type PhotoPickerProps = {
  id: string;
  label: string;
  /** Why the photo is worth attaching. Shown inside the drop zone, where the decision is made. */
  purpose: string;
  error?: string;
  value: File | null;
  onChange: (file: File | null) => void;
};

// A real <input type="file"> is still the control. It is only visually hidden, never
// removed, so it keeps its own keyboard behaviour and its native file manager; the
// drop zone is a <label> pointing at it, which is what makes click, Enter and Space
// all open the picker without a single key handler of our own. Dragging is an extra
// way in, never the only one.
export function PhotoPicker({ id, label, purpose, error, value, onChange }: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // Each object URL pins its file in memory until it is revoked, so the preview is
  // built in an effect and torn down with the file that produced it.
  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }

    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  // Clearing the input's own value matters: without it, choosing the same file again
  // after removing it fires no change event and the picker looks broken.
  function choose(file: File | null) {
    if (!file && inputRef.current) inputRef.current.value = "";
    onChange(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) choose(dropped);
  }

  const frame = dragging
    ? "border-accent bg-accent-100"
    : "border-divider bg-surface hover:border-accent hover:bg-accent-100";

  return (
    <Field label={label} htmlFor={id} error={error}>
      {/* Nested one level deeper on purpose: ds.css styles `.field > label` as a
          caption, which would flatten the drop zone if it were a direct child. */}
      <div
        className="flex flex-col gap-2"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          // Fires when crossing onto a child too, so only a real exit counts.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id={id}
          name={id}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          aria-invalid={error ? true : undefined}
          className="sr-only peer"
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />

        {value ? (
          <div className="flex flex-wrap items-start gap-3 border-2 border-divider p-3 peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2">
            {preview && !error && (
              <PhotoFrame
                src={preview}
                alt={`Preview of ${value.name}`}
                className="w-28 shrink-0"
                imageClassName="h-20"
              />
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-[13px]" title={value.name}>
                {value.name}
              </span>
              <span className="text-muted font-mono text-[11px]">{formatSize(value.size)}</span>

              <span className="flex flex-wrap gap-2 pt-1">
                <Button type="button" onClick={() => inputRef.current?.click()}>
                  Replace
                </Button>
                <Button type="button" variant="ghost" onClick={() => choose(null)}>
                  Remove
                </Button>
              </span>
            </div>
          </div>
        ) : (
          <label
            htmlFor={id}
            className={`flex cursor-pointer touch-manipulation flex-col items-center gap-2 border-2 border-dashed p-6 text-center transition-[background-color,border-color] duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2 motion-reduce:transition-none ${frame}`}
          >
            <span className="text-[13px]">{purpose}</span>
            <span className="btn btn-secondary">Choose a photo</span>
            <span className="text-muted font-mono text-[10px] uppercase tracking-wider">
              or drag one here &middot; JPG, PNG, WebP &middot; up&nbsp;to&nbsp;3&nbsp;MB
            </span>
          </label>
        )}

        {/* The choice happens outside the normal flow of the form, so it is announced. */}
        <span aria-live="polite" className="sr-only">
          {value ? `${value.name} selected, ${formatSize(value.size)}` : "No photo selected"}
        </span>
      </div>
    </Field>
  );
}
