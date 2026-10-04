import { cloneElement, isValidElement, useState } from "react";
import type { ComponentProps, FocusEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { STATUS_LABEL } from "../lib/types.js";
import type { ReportStatus } from "../lib/types.js";

// Thin wrappers over the design system's classes in styles/ds.css. They exist to
// carry the error and label wiring, not to restyle anything — every visual decision
// stays in the stylesheet so the screens match the wireframes by construction.

export function Button({
  variant = "secondary",
  block,
  className = "",
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost";
  block?: boolean;
}) {
  return <button className={`btn btn-${variant} ${block ? "btn-block" : ""} ${className}`.trim()} {...props} />;
}

// One field wrapper for every control, so the label, hint and error always sit the
// same way round and the error is announced rather than only coloured.
export function Field({
  label,
  hint,
  error,
  htmlFor,
  count,
  max,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  /** Current length. With `max`, draws a character count beside the hint. */
  count?: number;
  max?: number;
  children: ReactNode;
}) {
  // Hidden while the field is empty: a row of "0 / 150" under every untouched
  // control is noise, and the count only means anything once there is something
  // to count.
  const showCount = max !== undefined && count !== undefined && count > 0;
  const note = error ?? hint;
  const noteId = htmlFor && note ? fieldNoteId(htmlFor) : undefined;

  const existingDescribedBy =
    isValidElement<{ "aria-describedby"?: string }>(children) ? children.props["aria-describedby"] : undefined;
  const describedBy = noteId
    ? Array.from(
        new Set(
          [
            ...(existingDescribedBy ? existingDescribedBy.split(/\s+/) : []),
            noteId,
          ].filter(Boolean),
        ),
      ).join(" ") || undefined
    : existingDescribedBy || undefined;

  // Marks the control itself as invalid, so a screen reader says which field the
  // error belongs to. Only when the direct child is the labelled control; a
  // component that wraps its control sets the same attributes on it directly.
  const control =
    isValidElement<{ id?: string; "aria-describedby"?: string }>(children) && children.props.id === htmlFor
      ? cloneElement(children, {
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedBy,
        } as object)
      : children;

  return (
    <div className="field flex flex-col gap-1.5">
      <label htmlFor={htmlFor}>{label}</label>
      {control}

      {(note || showCount) && (
        <div className="flex items-baseline justify-between gap-3">
          {note ? (
            <span
              id={noteId}
              role={error ? "alert" : undefined}
              className={error ? "text-[11px] text-accent-700" : "text-muted text-[11px]"}
            >
              {note}
            </span>
          ) : (
            <span />
          )}

          {showCount && (
            <span
              className={`shrink-0 font-mono text-[10px] tabular-nums ${
                count === max ? "text-accent" : "text-muted"
              }`}
            >
              {count} / {max}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** The id of a Field's hint or error text, for controls that set aria-describedby themselves. */
export function fieldNoteId(htmlFor: string) {
  return `${htmlFor}-note`;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`.trim()} {...props} />;
}

// A password input with a Show/Hide toggle. Props, including the aria wiring Field
// adds, go straight to the input.
export function PasswordInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className={`pr-16 ${className}`.trim()} />
      <button
        type="button"
        className="absolute inset-y-0 right-0 px-3 text-[12px] font-semibold text-muted hover:text-text cursor-pointer bg-transparent border-0"
        aria-label={shown ? "Hide password" : "Show password"}
        onClick={() => setShown((value) => !value)}
      >
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input ${className}`.trim()} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`input ${className}`.trim()} {...props} />;
}

// The whole-form error: what the server rejected, above the submit button.
export function Alert({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="alert" className="border border-accent p-3 flex flex-col gap-1">
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-accent">{title}</span>
      {children && <span className="text-[13px] leading-snug">{children}</span>}
    </div>
  );
}

// Small glyphs that travel with a status word. Decorative: the word next to them
// carries the meaning, so they are hidden from screen readers.
function BadgeIcon({ kind }: { kind: "check" | "clock" | "alert" | "cross" }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="square"
      className="shrink-0"
    >
      {kind === "check" && <path d="M2 6.5 4.75 9 10 3" />}
      {kind === "cross" && <path d="M3 3l6 6M9 3 3 9" />}
      {kind === "clock" && (
        <>
          <circle cx="6" cy="6" r="4.5" />
          <path d="M6 3.5V6l1.75 1.25" />
        </>
      )}
      {kind === "alert" && (
        <>
          <path d="M6 1.5 11 10.5H1Z" />
          <path d="M6 5v2.25M6 8.75v.01" />
        </>
      )}
    </svg>
  );
}

const SUCCESS_TAG = "tag gap-1 border border-success-700 bg-success-100 text-success-800";
const WARNING_TAG = "tag gap-1 border border-warning-700 bg-warning-100 text-warning-800";

// Mono palette for open work: only the active status carries the accent, per the
// system's rule that red is used sparingly. A finished report is green with a check
// (SW-5), and an in-progress report whose resolution is waiting for an
// administrator says so in amber. Colour is never the only signal: each tone has
// its own word and icon.
export function StatusBadge({
  status,
  awaitingVerification = false,
}: {
  status: ReportStatus;
  /** True while a closure request waits for an administrator (under review or in progress). */
  awaitingVerification?: boolean;
}) {
  if ((status === "in_progress" || status === "under_review") && awaitingVerification) {
    return (
      <span className={WARNING_TAG}>
        <BadgeIcon kind="clock" />
        Awaiting verification
      </span>
    );
  }
  if (status === "resolved") {
    return (
      <span className={SUCCESS_TAG}>
        <BadgeIcon kind="check" />
        {STATUS_LABEL[status]}
      </span>
    );
  }
  // SW-7: closed without a repair. Neutral, not red: red is the accent for active
  // work and for errors, and a rejection is a decision, not a failure.
  if (status === "rejected") {
    return (
      <span className="tag tag-neutral gap-1 border border-neutral-700">
        <BadgeIcon kind="cross" />
        {STATUS_LABEL[status]}
      </span>
    );
  }
  const tone = status === "in_progress" ? "tag-accent" : "tag-outline";
  return <span className={`tag ${tone}`}>{STATUS_LABEL[status]}</span>;
}

// "Delayed" when a report has sat at its stage past the threshold (SW-6). Renders
// nothing when it is on time, so a list only draws attention to the late ones.
export function DelayBadge({ delay }: { delay: { delayed: boolean; days: number } | null | undefined }) {
  if (!delay?.delayed) return null;
  return (
    <span className={WARNING_TAG}>
      <BadgeIcon kind="alert" />
      Delayed &middot; {formatDays(delay.days)}
    </span>
  );
}

export function formatDays(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`.trim()}>{children}</div>;
}

// Used wherever a list can legitimately be empty. Says why it is empty and what to
// do next, never just "No results".
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-divider p-8 flex flex-col gap-2 items-start">
      <h4>{title}</h4>
      {children && <div className="text-muted text-[13px] max-w-prose">{children}</div>}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <p role="status" className="text-muted font-mono text-[11px] uppercase tracking-wider py-8">
      {label}...
    </p>
  );
}

export function Pagination({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  if (total === 0) return null;

  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <Button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span className="text-muted font-mono text-[11px]">
        {first}&ndash;{last} of {total}
      </span>
      <Button type="button" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  );
}

export function formatDate(value: string | null) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: string | null) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// How the system mounts a photo: a 2px rule and a surface mat, so evidence reads as
// something deliberately presented rather than an image that bled into the page.
// Colour is the point — a citizen judges a pothole, and staff judge a repair, by what
// it actually looks like, so nothing here desaturates it.
//
// Built from <span>s: the board renders a frame inside a <button>, where a <div>
// would be invalid markup.
export function PhotoFrame({
  src,
  alt,
  width = 320,
  height = 240,
  className = "",
  imageClassName = "h-32",
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <span className={`block border-2 border-divider bg-surface p-1.5 ${className}`.trim()}>
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className={`block w-full object-cover bg-neutral-200 ${imageClassName}`.trim()}
      />
    </span>
  );
}

// Stands in for a photo whose file was removed after the retention period (DM-2).
// Same frame as PhotoFrame, so the grid keeps its shape; plain text, so it is not
// mistaken for something to open.
export function RemovedPhoto({ label, imageClassName = "h-32" }: { label: string; imageClassName?: string }) {
  return (
    <span className="block border-2 border-divider bg-surface p-1.5">
      <span
        className={`flex items-center justify-center bg-neutral-200 p-3 text-center text-[12px] text-text ${imageClassName}`.trim()}
      >
        {label}: photo removed after the 90-day retention period.
      </span>
    </span>
  );
}

// Sends focus to the first control a form rejected. Only sign-in still needs it: it
// is the one form whose submit stays enabled (see useLeftFields).
//
// Key order follows the order the validator checks fields in, which is the order
// they appear on screen. `ids` maps an error key to its control id where the two
// differ.
export function focusFirstError(errors: Record<string, string>, ids: Record<string, string> = {}) {
  const [first] = Object.keys(errors);
  if (!first) return;
  document.getElementById(ids[first] ?? first)?.focus();
}

/** Filters an error record down to the controls that have already been left/blurred. */
export function filterLeftErrors(
  errors: Record<string, string>,
  left: ReadonlySet<string>,
  ids: Record<string, string> = {},
): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => left.has(ids[key] ?? key)));
}

// The one form rule (KR-07): an action button is disabled while its form is invalid,
// so an error is never the result of a click. A field's error appears once the
// person leaves it, which is what explains the disabled button. Sign-in is the one
// exception: only the server can judge a password, and a disabled button is what
// browser autofill strands. Put `onBlur` on the
// form's container; `visible` keeps only the errors of controls already left.
// `ids` maps an error key to its control id where the two differ.
export function useLeftFields() {
  const [left, setLeft] = useState<ReadonlySet<string>>(() => new Set());

  return {
    onBlur(event: FocusEvent<HTMLElement>) {
      const { id } = event.target;
      if (id) setLeft((current) => (current.has(id) ? current : new Set(current).add(id)));
    },
    visible(errors: Record<string, string>, ids: Record<string, string> = {}) {
      return filterLeftErrors(errors, left, ids);
    },
    reset() {
      setLeft(new Set());
    },
  };
}
