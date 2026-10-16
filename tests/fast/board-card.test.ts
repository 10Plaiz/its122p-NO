import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardReportCard } from "../../src/web/components/BoardReportCard.js";
import { BoardLegend } from "../../src/web/components/BoardLegend.js";
import type { PublicReport } from "../../src/web/lib/types.js";

const report: PublicReport = {
  id: "public-1", reference_code: "KAM-1", title: "Road repair", description: "Public description",
  category: "Road", category_id: 1, latitude: 14.5547, longitude: 121.0244, address_text: null,
  status: "rejected", submitted_at: "2026-10-12T00:00:00Z", resolved_at: null, barangay: null,
  rejection_reason: "Approved public reason", photos: [
    { kind: "initial", storage_path: "first", url: "/first.png" },
    { kind: "resolution", storage_path: "second", url: "/second.png" },
  ],
};

test("expanded public cards offer every public photo and the approved rejection reason", () => {
  const html = renderToStaticMarkup(createElement(BoardReportCard, { report, isSelected: true, onToggle() {} }));
  expect(html.match(/aria-label="Enlarge photo of Road repair"/g)).toHaveLength(2);
  expect(html).toContain("Approved public reason");
  expect(html).toContain("Public description");
});

test("collapsed public cards keep report details and photos closed", () => {
  const html = renderToStaticMarkup(createElement(BoardReportCard, { report, isSelected: false, onToggle() {} }));
  expect(html).not.toContain("/first.png");
  expect(html).not.toContain("Approved public reason");
  expect(html).toContain('aria-expanded="false"');
});

test("the legend explains each public status and the map's paging scope in words", () => {
  const html = renderToStaticMarkup(createElement(BoardLegend));
  for (const label of ["Under review", "In progress", "Resolved", "Rejected", "current results page"]) expect(html).toContain(label);
  expect(html).not.toContain("Pending");
});
