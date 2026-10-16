import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../ui.js";
import { lastPage, pageItems, parsePage, rangeSummary } from "./pages.js";

// TB-1: Previous · 1 2 3 … 9 10 · Next, plus a jump-to-page box, driven by the
// Paged envelope every list route returns ({ page, per_page, total }).
//
// Page buttons keep their square, compact layout independent of action buttons.
const PAGE_BUTTON =
  "inline-flex h-9 min-w-9 cursor-pointer items-center justify-center border border-divider bg-transparent px-2 font-mono text-[12px] tabular-nums text-text hover:bg-neutral-200 active:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-45";
const CURRENT_PAGE = "inline-flex h-9 min-w-9 items-center justify-center border border-accent bg-accent px-2 font-mono text-[12px] font-semibold tabular-nums text-bg disabled:opacity-45";

export function NumberedPagination({
  page,
  perPage,
  total,
  onPage,
  label = "Pagination",
  disabled = false,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
  /** Names the nav landmark when a screen has more than one table. */
  label?: string;
  disabled?: boolean;
}) {
  const last = lastPage(total, perPage);
  const [jump, setJump] = useState("");
  const [error, setError] = useState<string | null>(null);
  const jumpId = useId();
  const errorId = `${jumpId}-error`;

  if (total <= 0) return null;

  function go(target: number) {
    if (disabled) return;
    setError(null);
    if (target !== page) onPage(target);
  }

  function submitJump(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const target = parsePage(jump, last);
    if (target === null) {
      setError(`Enter a page from 1 to ${last}.`);
      return;
    }
    setJump("");
    go(target);
  }

  return (
    <nav aria-label={label} className="pagination" data-pagination>
      <p className="pagination-range" aria-live="polite" aria-atomic="true">
        {rangeSummary(page, perPage, total)}
      </p>

      {last > 1 && (
        <div className="pagination-controls">
          <div className="pagination-navigation">
            <Button type="button" className="min-h-9" disabled={disabled || page <= 1} onClick={() => go(page - 1)}>
              Previous
            </Button>

            <span className="pagination-current font-mono text-[12px] tabular-nums" aria-current="page">
              Page {page.toLocaleString("en-PH")} of {last.toLocaleString("en-PH")}
            </span>
            <ul className="pagination-pages m-0 list-none items-center gap-1 p-0">
              {pageItems(page, last).map((item, index) =>
                item === "gap" ? (
                  <li key={`gap-${index}`} aria-hidden="true" className="px-1 font-mono text-[12px] text-muted">
                    &hellip;
                  </li>
                ) : (
                  <li key={item}>
                    {item === page ? (
                      <button type="button" className={CURRENT_PAGE} aria-current="page" aria-label={`Page ${item}, current page`} disabled={disabled}>
                        {item}
                      </button>
                    ) : (
                      <button type="button" className={PAGE_BUTTON} aria-label={`Page ${item}`} disabled={disabled} onClick={() => go(item)}>
                        {item}
                      </button>
                    )}
                  </li>
                ),
              )}
            </ul>

            <Button type="button" className="min-h-9" disabled={disabled || page >= last} onClick={() => go(page + 1)}>
              Next
            </Button>
          </div>

          <form className="pagination-jump" onSubmit={submitJump} noValidate>
            <label htmlFor={jumpId} className="text-[12px] text-muted whitespace-nowrap">
              Go to page
            </label>
            <div className="w-20">
              <input
                id={jumpId}
                name="page"
                className="input tabular-nums"
                type="number"
                inputMode="numeric"
                autoComplete="off"
                disabled={disabled}
                min={1}
                max={last}
                placeholder={`1–${last}`}
                value={jump}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => {
                  setJump(event.target.value);
                  setError(null);
                }}
              />
            </div>
            <Button type="submit" className="min-h-9" disabled={disabled}>
              Go
            </Button>
          </form>
        </div>
      )}

      {error && (
        <p id={errorId} role="alert" className="m-0 w-full text-right text-[11px] text-danger">
          {error}
        </p>
      )}
    </nav>
  );
}
