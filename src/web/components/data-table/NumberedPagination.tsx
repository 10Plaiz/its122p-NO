import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../ui.js";
import { lastPage, pageItems, parsePage, rangeSummary } from "./pages.js";

// TB-1: Previous · 1 2 3 … 9 10 · Next, plus a jump-to-page box, driven by the
// Paged envelope every list route returns ({ page, per_page, total }).
//
// Page buttons are plain <button>s rather than .btn: ds.css is unlayered, so a
// .btn's transparent background would beat the Tailwind fill that marks the
// current page.
const PAGE_BUTTON =
  "inline-flex h-9 min-w-9 cursor-pointer items-center justify-center border border-divider bg-transparent px-2 font-mono text-[12px] tabular-nums text-text hover:bg-neutral-200";
const CURRENT_PAGE = "inline-flex h-9 min-w-9 items-center justify-center border border-accent bg-accent px-2 font-mono text-[12px] font-semibold tabular-nums text-bg";

export function NumberedPagination({
  page,
  perPage,
  total,
  onPage,
  label = "Pagination",
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
  /** Names the nav landmark when a screen has more than one table. */
  label?: string;
}) {
  const last = lastPage(total, perPage);
  const [jump, setJump] = useState("");
  const [error, setError] = useState<string | null>(null);
  const jumpId = useId();
  const errorId = `${jumpId}-error`;

  if (total <= 0) return null;

  function go(target: number) {
    setError(null);
    if (target !== page) onPage(target);
  }

  function submitJump(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = parsePage(jump, last);
    if (target === null) {
      setError(`Enter a page from 1 to ${last}.`);
      return;
    }
    setJump("");
    go(target);
  }

  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3" data-pagination>
      <p className="m-0 text-muted font-mono text-[11px] tabular-nums" aria-live="polite">
        {rangeSummary(page, perPage, total)}
      </p>

      {last > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" className="min-h-9" disabled={page <= 1} onClick={() => go(page - 1)}>
              Previous
            </Button>

            <ul className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
              {pageItems(page, last).map((item, index) =>
                item === "gap" ? (
                  <li key={`gap-${index}`} aria-hidden="true" className="px-1 font-mono text-[12px] text-muted">
                    &hellip;
                  </li>
                ) : (
                  <li key={item}>
                    {item === page ? (
                      <button type="button" className={CURRENT_PAGE} aria-current="page" aria-label={`Page ${item}, current page`}>
                        {item}
                      </button>
                    ) : (
                      <button type="button" className={PAGE_BUTTON} aria-label={`Page ${item}`} onClick={() => go(item)}>
                        {item}
                      </button>
                    )}
                  </li>
                ),
              )}
            </ul>

            <Button type="button" className="min-h-9" disabled={page >= last} onClick={() => go(page + 1)}>
              Next
            </Button>
          </div>

          <form className="flex items-center gap-2" onSubmit={submitJump} noValidate>
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
            <Button type="submit" className="min-h-9">
              Go
            </Button>
          </form>
        </div>
      )}

      {error && (
        <p id={errorId} role="alert" className="m-0 w-full text-right text-[11px] text-accent-700">
          {error}
        </p>
      )}
    </nav>
  );
}
