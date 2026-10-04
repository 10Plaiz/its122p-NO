# KAMOTI design system

KAMOTI uses a calm Modernist interface for public infrastructure reporting.
Its voice is plain, calm, practical, and civic. Use familiar action labels such
as "Review" and "Clear filters", with specific feedback after a request.
The user approved deep teal for routine actions on 2026-10-04, with red reserved
for errors and destructive actions. This contract applies to every public,
citizen, staff, and administrator screen.

## Foundation

- Keep the existing page structure, square controls, visible rules, and Archivo
  typography. App pages use tables, forms, and record views. The entry page
  introduces reporting and links to the public board.
- Use upright headings with weight 800 and body text with weight 400. Use the
  system monospace stack for reference codes, dates, and compact metadata.
- Keep the existing 4 px spacing scale and zero-radius control tokens. Read-only
  status pills use the dedicated `--radius-pill` token to distinguish state from
  a clickable button.
- Use brief state transitions and honor reduced motion. Success messages remain
  polite toasts; errors appear beside fields or in an alert.

## Palette and meaning

The canonical tokens live in [tokens.css](src/web/styles/tokens.css). Components
use named tokens or generated Tailwind utilities. Do not add page-specific
colors, a second brand accent, or a separate token register.

| Role | Base color | Meaning |
| :--- | :--- | :--- |
| Background | `#F4F7F7` | Page background |
| Surface | `#E9EFEF` | Cards and controls |
| Text | `#1F292B` | Primary copy |
| Muted | `#526164` | Secondary copy, hints, and metadata |
| Divider | `#738287` | Rules and control boundaries |
| Action / accent | `#0D6374` | Routine actions, links, selection, and focus |
| Information | `#1F5B8F` | Work under review and unread notifications |
| Success | `#155F35` | Resolved work and successful verification |
| Warning | `#6B4500` | Delays, waiting for verification, and incomplete setup |
| Danger | `#B42318` | Invalid input, failed requests, and destructive actions |

Use neutral rectangular tags for categories and roles. Pending, cancelled, and
rejected reports use neutral pills. Under review uses information blue, in progress uses action teal, and
resolved uses success green. Awaiting verification and delayed work use amber.
The report map and status badges follow the same mapping.

Red must not identify routine primary actions, active navigation, categories,
unread notifications, chart bars, saved drafts, or normal report progress.
Use the danger button variant for cancellation, deactivation, retirement,
permanent removal, and rejection actions. Dismissal buttons such as Cancel,
Back, Close, and Keep it remain neutral.

Every status keeps its written label. Color supplements meaning; it does not
replace the label or accessible name. Keep existing confirmation and permission
behavior when changing presentation.

## Component ownership

[ds.css](src/web/styles/ds.css) owns reusable component styles and is imported
in the components cascade layer. Tailwind utilities can customize layout without
being silently overridden by unlayered component rules. [app.css](src/web/styles/app.css)
owns imports and application-level behavior.

[ui.tsx](src/web/components/ui.tsx) owns shared button variants, fields, alerts,
and status labels. `StatusPill` owns the shared capsule shape, soft fills,
spacing, and type size. `StatusBadge` maps report states onto it; `DelayBadge`
uses the warning treatment. Account status, residency, phone verification, and
unread notifications use the same component. Pills are noninteractive spans,
with no outline, tab stop, or hover change. Categories and roles remain tags.

`TableToolbar` renders filters and utility menus before its `search` slot.
Search is the last control on the right, in DOM and visual order. Controls wrap
on smaller screens; the public board follows the same ordering in its grid.

`FilterOption` renders native dropdown choices with a shared count format,
such as `Pending (12)`. Counts include the other active filters and every result
page. They retain zero-result choices so filters remain predictable. Missing
counts stay unlabeled while `FilterCountsFeedback` announces loading or offers
Retry counts after failure. Sort choices have no counts because they reorder
the same results. Keep the existing square select styling and visible labels.

Use a relative scroll container for wide tables so absolutely positioned
accessible labels stay inside it on narrow screens.

The Modernist wireframe assets are historical design references. The live
frontend tokens and this contract own the current application palette.

## Verification

Ordinary text must meet 4.5:1 contrast, large text 3:1, and meaningful control
boundaries 3:1. These thresholds follow the
[WCAG text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
Measure the rendered foreground against its actual background.

Check public and authenticated views at 320, 375, 414, 768, and desktop widths.
Verify navigation, filtering, validation, and confirmation dialogs through the
running website. Keep wide-table scrolling inside its container. Do not rely on
a build or a token contrast calculation alone as proof of runtime behavior.
