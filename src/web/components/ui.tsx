import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
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
}: ButtonHTMLAttributes<HTMLButtonElement> & {
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
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="field flex flex-col gap-1.5">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <span className="text-muted text-[11px]">{hint}</span>}
      {error && (
        <span role="alert" className="text-[11px] text-accent-700">
          {error}
        </span>
      )}
    </div>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`.trim()} {...props} />;
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

export function StatusBadge({ status }: { status: ReportStatus }) {
  // Mono palette: only the active status carries the accent, per the system's rule
  // that red is used sparingly.
  const tone = status === "in_progress" ? "tag-accent" : "tag-outline";
  return <span className={`tag ${tone}`}>{STATUS_LABEL[status]}</span>;
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
