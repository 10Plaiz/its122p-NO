import type { ReactNode } from "react";

// Filters and utilities precede search in both visual and keyboard order.
export function TableToolbar({
  title,
  description,
  action,
  search,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** The screen's own call to action ("Report an issue"), kept with the title, apart from the filters. */
  action?: ReactNode;
  /** The search field, always the last control on the right. */
  search?: ReactNode;
  /** Filters, then ColumnMenu and ExportMenu. */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="flex min-w-0 max-w-prose flex-col gap-1">
        <h2 className="m-0 text-balance">{title}</h2>
        {description && <p className="m-0 text-muted text-[13px]">{description}</p>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>

      <div
        role="group"
        aria-label={`${title} search and filters`}
        className="ml-auto flex w-full flex-wrap items-end gap-2 sm:w-auto sm:justify-end"
      >
        {children}
        {search && <ToolbarItem wide>{search}</ToolbarItem>}
      </div>
    </header>
  );
}

// Sizes each control as one wrapping unit in the toolbar.
export function ToolbarItem({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`w-full ${wide ? "sm:w-56" : "sm:w-40"}`}>{children}</div>;
}
