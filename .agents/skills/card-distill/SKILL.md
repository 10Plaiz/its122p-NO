---
name: card-distill
description: Refactor and distill cluttered UI components (cards, list items, drawers) and full-page record views (dossiers, inspection consoles) into high-hierarchy, accessible two-tone layouts. Use for /card-distill, /layout-distill, fixing visual hierarchy, and eliminating UI slop.
---

# Layout Distill

Refactor cluttered UI components and full-page views into high-hierarchy, accessible two-tone layouts.

## Impact

- **Consumer.** Information scans naturally from entity identity to classification, operational state, and action. Text remains selectable across cards and full-page views without triggering collapse or navigation.
- **Maintainer.** Replaces ad-hoc border boxes with two deterministic structural blueprints. Confines interactive targets to explicit buttons.

## Structural Sources

Read these files before modifying any component or view:
- Design tokens: [src/web/styles/app.css](../../src/web/styles/app.css). Uses `--color-surface`, `--color-neutral-200`, `--color-neutral-300`, and `--color-divider`.
- Design system base: [src/web/styles/ds.css](../../src/web/styles/ds.css). Defines `.card`, `.tag`, and typography defaults.
- Shared components: [src/web/components/ui.tsx](../../src/web/components/ui.tsx). Supplies `StatusBadge`, `PhotoFrame`, `formatDate`, and `formatDateTime`.

---

## Scope Routing Gate

Evaluate the target brief before modifying files:
- **Component Scope.** Target is an atomic UI element (card, list row, accordion, modal drawer). Execute **Blueprint A**.
- **View Scope.** Target is a full-page screen (inspection console, citizen detail view, administrative record). Execute **Blueprint B**.

---

## Blueprint A: Component Scope (Cards and List Items)

Every expandable card follows a three-unit vertical structure.

```
+---------------------------------------------------------------------------------------+
| Unit 1: Identity and Context                                                          |
|   Title: 16px bold text-text. Text-wrap balance.                                      |
|   Subtitle: 12px neutral-700. Tightly coupled under title (!m-0 !mt-0.5).             |
|                                                                                       |
| Unit 2: Directional Control Row                                                       |
|   Left: Category Tag and Status Badge.                                                |
|   Right: Timestamp and square disclosure button (button[aria-expanded]).              |
+=======================================================================================+
| Unit 3: Recessed Details Tray (Expanded State Only)                                   |
|   Full-bleed top border (border-t border-divider). Contrasting tint (bg-neutral-300/60).|
|   Subordinate Reference ID in monospace. Standard sentence case (Reference:).        |
|   Selectable description copy with relaxed leading.                                   |
|   Structured media frame with explicit aspect ratio bounding.                         |
+---------------------------------------------------------------------------------------+
```

### Component Code Pattern

```tsx
import type { PublicReport } from "../lib/types.js";
import { PhotoFrame, StatusBadge, formatDate } from "./ui.js";

export interface ReportCardProps {
  report: PublicReport;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

export function ReportCard({ report, isSelected, onToggle }: ReportCardProps) {
  const panelId = `report-panel-${report.id}`;
  const headerId = `report-header-${report.id}`;

  return (
    <article
      className={`card p-4 flex flex-col gap-3 transition-colors border ${
        isSelected
          ? "border-accent shadow-sm"
          : "border-divider hover:border-neutral-500"
      }`}
    >
      <div className="flex flex-col">
        <h3 className="card-title select-text cursor-text text-[16px] font-bold text-text leading-snug break-words text-balance !m-0 !mb-0">
          {report.title}
        </h3>
        {report.address_text && (
          <p className="text-[12px] font-medium text-neutral-700 select-text cursor-text !m-0 !mt-0.5 leading-tight">
            {report.address_text}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap pt-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="tag tag-outline text-[12px] font-semibold tracking-wide">
            {report.category}
          </span>
          <StatusBadge status={report.status} />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <time className="text-[12px] font-medium text-neutral-700 select-text">
            {formatDate(report.submitted_at)}
          </time>

          <button
            id={headerId}
            type="button"
            aria-expanded={isSelected}
            aria-controls={panelId}
            onClick={() => onToggle(report.id)}
            className="size-8 shrink-0 flex items-center justify-center bg-surface hover:bg-neutral-300 border border-divider transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 touch-manipulation cursor-pointer"
          >
            <svg
              className={`size-4 transform transition-transform duration-150 motion-reduce:transition-none ${
                isSelected ? "rotate-180 text-accent" : "text-text"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            <span className="sr-only">
              {isSelected ? `Collapse details for ${report.title}` : `Expand details for ${report.title}`}
            </span>
          </button>
        </div>
      </div>

      {isSelected && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className="-mx-4 -mb-4 p-4 mt-1 bg-neutral-300/60 border-t border-divider flex flex-col gap-2.5"
        >
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-600">
            <span className="text-neutral-500 text-[11px]">Reference:</span>
            <span className="font-semibold select-text cursor-text text-neutral-800">
              {report.reference_code}
            </span>
          </div>

          <p className="text-[13px] select-text cursor-text leading-relaxed text-text !m-0">
            {report.description}
          </p>

          {report.photos[0] && (
            <PhotoFrame
              src={report.photos[0].url}
              alt={`Photo of ${report.title}`}
              imageClassName="h-48 w-full object-cover"
            />
          )}
        </div>
      )}
    </article>
  );
}
```

---

## Blueprint B: View Scope (Full-Page Records and Consoles)

Every full-page record uses a two-zone layout: a full-width hero header and a split-canvas workbench.

```
+-----------------------------------------------------------------------------------------------+
| Zone 1: Consolidated Hero Header (Full Width)                                                 |
|   Title: 28px to 32px bold text-text. Primary entity name.                                    |
|   Subtitle: Full physical address directly coupled under title (!m-0 !mt-1).                  |
|                                                                                               |
|   Metadata Bar: [Category Tag]  [StatusBadge]  [Ref Code Badge] ......... [Filed Date & Time]|
+===============================================================================================+
| Zone 2: Two-Tone Split Canvas (60% Dossier / 40% Recessed Tray)                               |
|                                                                                               |
|  Left Column: Read Dossier (Primary Canvas) | Right Column: Operational Tray (bg-neutral-200) |
|  - Sentence-case headers (Report details).  | - Contrasting surface tint. Border-divider.     |
|  - Description copy with relaxed leading.   | - Action Panel: Status transitions and forms.   |
|  - Reporter info: name, email, direct call. | - Activity Timeline: Clean vertical node rail.  |
|  - Media grid and Leaflet map container.    |   Status pill transitions. Zero middle dots.    |
+-----------------------------------------------------------------------------------------------+
```

### View Code Pattern

```tsx
import { Link } from "react-router-dom";
import type { Report } from "../lib/types.js";
import { PhotoFrame, StatusBadge, formatDateTime } from "../components/ui.js";

export function ReportDetailView({ report }: { report: Report }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Zone 1: Consolidated Hero Header */}
      <header className="flex flex-col gap-2 pb-4 border-b border-divider">
        <h1 className="text-[28px] font-bold text-text leading-tight !m-0 !mb-0 text-balance">
          {report.title}
        </h1>

        {report.address_text && (
          <p className="text-[14px] font-medium text-neutral-700 !m-0 !mt-0.5">
            {report.address_text}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="tag tag-outline text-[12px] font-semibold tracking-wide">
              {report.category?.name ?? "Uncategorised"}
            </span>
            <StatusBadge status={report.status} />
            <span className="font-mono text-[11px] bg-neutral-200 px-2 py-0.5 border border-divider text-neutral-800">
              {report.reference_code}
            </span>
          </div>

          <time className="text-[12px] font-medium text-neutral-700 font-mono">
            Filed {formatDateTime(report.submitted_at)}
          </time>
        </div>
      </header>

      {/* Zone 2: Two-Tone Split Canvas */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Read Dossier (7 of 12 columns) */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-[16px] font-bold text-text !m-0">Report details</h2>
            <p className="text-[14px] leading-relaxed text-text whitespace-pre-line !m-0">
              {report.description}
            </p>
          </div>

          {report.citizen && (
            <div className="flex flex-col gap-2 pt-4 border-t border-divider">
              <h2 className="text-[14px] font-bold text-text !m-0">Reporter information</h2>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[13px] font-semibold text-text !m-0">{report.citizen.name}</p>
                  <p className="text-[12px] text-neutral-600 font-mono !m-0">{report.citizen.email}</p>
                </div>
                {report.citizen.contact_number && (
                  <a
                    href={`tel:${report.citizen.contact_number.replace(/[^\d+]/g, "")}`}
                    className="btn btn-secondary text-[12px] py-1 px-3"
                  >
                    Call {report.citizen.contact_number}
                  </a>
                )}
              </div>
            </div>
          )}

          {report.photos.length > 0 && (
            <div className="flex flex-col gap-3 pt-4 border-t border-divider">
              <h2 className="text-[14px] font-bold text-text !m-0">Photo evidence</h2>
              <div className="grid grid-cols-2 gap-3">
                {report.photos.map((photo) => (
                  <PhotoFrame
                    key={photo.id}
                    src={photo.url}
                    alt={`Photo for report ${report.reference_code}`}
                    imageClassName="h-44 w-full object-cover"
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Operational Tray (5 of 12 columns) */}
        <aside className="lg:col-span-5 bg-neutral-200/60 border border-divider p-4 flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <h2 className="text-[14px] font-bold text-text !m-0">Action workbench</h2>
            {/* Status transitions, assignment selectors, or remark forms render here */}
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t border-divider">
            <h2 className="text-[14px] font-bold text-text !m-0">Activity history</h2>
            {/* Structured vertical activity timeline renders here with zero middle dots */}
          </div>
        </aside>
      </div>
    </div>
  );
}
```

---

## Universal Decision Gates

Every card or full-page view must satisfy these eight binary gates before handoff:

1. **Selection Gate.** Text selection must never trigger card collapse or route navigation. Keep text in standard DOM flow with `select-text cursor-text`. Confine click targets to dedicated buttons.
2. **Gestalt Coupling Gate.** Title and address must form a single visual unit. Strip default vertical margins with `!m-0 !mb-0` on headings and `!m-0 !mt-0.5` on subtitles.
3. **Directionality Gate.** Horizontal flow reads from classification to action. Place category and status badge on the left. Anchor timestamps and interactive buttons on the right.
4. **Audience Scoping Gate.** Administrative identifiers must never compete with human titles. Place reference codes in expanded trays or subordinate metadata bars. Banish shouting uppercase kickers.
5. **Two-Tone Surface Gate.** Secondary surfaces (expanded trays or operational sidebars) must inhabit a distinct surface plane (`bg-neutral-200` or `bg-neutral-300/60`) with an edge-to-edge border (`border-divider`).
6. **Typographical Hygiene Gate.** Separate layout elements using CSS flexbox gaps. Never use middle dots (`·`), pipes (`|`), or bullets (`•`) as layout separators.
7. **Locked Token Gate.** Map colors strictly to host design tokens (`bg-surface`, `bg-neutral-X`, `border-divider`). Never introduce arbitrary hex codes. Never add `dark:` variants when working in a fixed light-mode design system.
8. **Contrast Floor Gate.** Subordinate metadata and muted copy must achieve `>= 4.5:1` WCAG contrast against their background surface. Light gray text is banned.

---

## Verification

### Automated Playwright Harness (Component Scope)

```typescript
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

async function verifyCard(url: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url);
  await page.waitForLoadState("networkidle");

  const trigger = page.locator("button[aria-expanded]").first();
  await trigger.click();
  await page.waitForTimeout(150);

  const title = page.locator(".card-title").first();
  await title.selectText();

  const isExpanded = await trigger.getAttribute("aria-expanded");
  assert.equal(isExpanded, "true", "Text selection must not collapse card");

  await browser.close();
}
```

### Viewport Stress Matrix

Validate resilience across these standard breakpoints:
- **Mobile (375x812):** Single-column layout. Metadata bar wraps cleanly. Zero horizontal document scroll.
- **Tablet (768x1024):** Clean spacing harmony. Columns stack or align without text collision.
- **Desktop (1280x800):** Balanced two-column grid (60/40 or 65/35). Visual centering on actions.
