import { describe, expect, it } from "bun:test";
import { generateSeed, stableId } from "../../scripts/demo/generate_seed.js";
import type { DemoReport } from "../../scripts/demo/generate_seed.js";

describe("demo seed generator", () => {
  it("returns the requested account and report profiles with every status and category represented", () => {
    const data = generateSeed();
    expect(data.dataset).toBe("makati-demo-v1");
    expect(data.seed).toBe(42);
    expect(data.asOf).toBe("2026-09-27");
    expect(data.accounts).toHaveLength(36);
    expect(data.accounts.filter((account) => account.role === "citizen")).toHaveLength(30);
    expect(data.accounts.filter((account) => account.role === "staff")).toHaveLength(5);
    expect(data.accounts.filter((account) => account.role === "admin")).toHaveLength(1);
    expect(data.reports).toHaveLength(150);

    const counts = new Map<string, number>();
    for (const report of data.reports) counts.set(report.status, (counts.get(report.status) ?? 0) + 1);
    expect(counts.get("pending")).toBe(30);
    expect(counts.get("under_review")).toBe(30);
    expect(counts.get("in_progress")).toBe(30);
    expect(counts.get("resolved")).toBe(50);
    expect(counts.get("cancelled")).toBe(10);
    for (const status of ["pending", "under_review", "in_progress", "resolved", "cancelled"] as const) {
      for (const category of ["Road", "Streetlight", "Drainage", "Signage", "Sidewalk", "Other"] as const) {
        expect(data.reports.some((report) => report.status === status && report.category === category)).toBe(true);
      }
    }
    expect(data.accounts.some((account) => account.email === "demo-makati-staff-5@kamoti.invalid")).toBe(true);
    expect(data.reports.some((report) => report.staffKey === "staff-5")).toBe(false);
    expect(new Set(data.accounts.filter((account) => account.role === "citizen").map((account) => account.name)).size).toBe(30);
    const citizensWithReports = new Map<string, number>();
    const staffAssignments = new Map<string, number>();
    for (const report of data.reports) {
      citizensWithReports.set(report.ownerKey, (citizensWithReports.get(report.ownerKey) ?? 0) + 1);
      if (report.staffKey) staffAssignments.set(report.staffKey, (staffAssignments.get(report.staffKey) ?? 0) + 1);
    }
    expect(Math.max(...citizensWithReports.values())).toBeGreaterThan(Math.min(...citizensWithReports.values()));
    expect(new Set(staffAssignments.values()).size).toBeGreaterThan(1);
    const resolutionDays = data.reports.filter(report => report.resolved_at !== null)
      .map(report => (Date.parse(report.resolved_at ?? "") - Date.parse(report.submitted_at)) / 86400000);
    expect(Math.min(...resolutionDays)).toBeGreaterThanOrEqual(0.25);
    expect(Math.max(...resolutionDays)).toBeGreaterThan(10);
    expect(new Set(resolutionDays.map(Math.round)).size).toBeGreaterThan(5);
  });

  it("repeats exactly for the same inputs while changing the generated sample for another seed", () => {
    const first = generateSeed({ seed: 17 });
    expect(generateSeed({ seed: 17 })).toEqual(first);
    expect(generateSeed({ seed: 18 })).not.toEqual(first);
    expect(stableId("report-001")).toBe(stableId("report-001"));
    expect(stableId("report-001")).not.toBe(stableId("report-002"));
    expect(stableId("report-001")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("keeps synthetic records linked, chronological, and within the six-month window", () => {
    const { accounts, reports, asOf } = generateSeed();
    const accountByKey = new Map(accounts.map((account) => [account.key, account]));
    const lowerBound = Date.parse(`${asOf}T00:00:00.000Z`) - 183 * 86400000;
    const upperBound = Date.parse(`${asOf}T00:00:00.000Z`);
    const areaAnchors: Record<string, { latitude: number; longitude: number }> = {
      "Ayala Avenue": { latitude: 14.5547, longitude: 121.0244 },
      "Legazpi Village": { latitude: 14.5513, longitude: 121.0198 },
      "Salcedo Village": { latitude: 14.5607, longitude: 121.0248 },
      Poblacion: { latitude: 14.5658, longitude: 121.0314 },
      "Bel-Air": { latitude: 14.563, longitude: 121.028 },
      "San Lorenzo": { latitude: 14.548, longitude: 121.023 },
    };
    const allIds = [...accounts.map(({ key }) => stableId(`account:${key}`)), ...reports.flatMap((report) => [report.id, ...report.updates.map((item) => item.id), ...report.notifications.map((item) => item.id), ...report.photos.map((item) => item.id)])];
    expect(new Set(allIds).size).toBe(allIds.length);

    for (const report of reports) {
      expect(accountByKey.get(report.ownerKey)?.role).toBe("citizen");
      if (report.staffKey) expect(accountByKey.get(report.staffKey)?.role).toBe("staff");
      expect(report.title.startsWith("[DEMO]")).toBe(true);
      expect(report.title).not.toBe(`[DEMO] ${report.category} concern near ${report.address_text.split(",")[0]}`);
      expect(report.description).toContain("does not describe a verified incident");
      expect(report.address_text).toContain("synthetic demo location");
      const locationName = report.address_text.split(",")[0] ?? "";
      const anchor = areaAnchors[locationName];
      if (!anchor) throw new Error(`Unknown demo area: ${locationName}`);
      expect(Math.abs(report.latitude - anchor.latitude)).toBeLessThanOrEqual(0.0005);
      expect(Math.abs(report.longitude - anchor.longitude)).toBeLessThanOrEqual(0.0005);
      expect(report.is_public).toBe(["under_review", "in_progress", "resolved"].includes(report.status));
      const submitted = Date.parse(report.submitted_at);
      expect(submitted).toBeGreaterThanOrEqual(lowerBound);
      expect(submitted).toBeLessThanOrEqual(upperBound);
      expect(Date.parse(report.updated_at)).toBeGreaterThanOrEqual(submitted);
      expect(Date.parse(report.updated_at)).toBeLessThanOrEqual(upperBound);
      expect(Date.parse(accountByKey.get(report.ownerKey)?.created_at ?? "invalid")).toBeLessThan(submitted);
      expect(report.resolved_at !== null).toBe(report.status === "resolved");

      let status: DemoReport["status"] = "pending";
      let lastTime = submitted;
      let assignments = 0;
      const photoEvents: string[] = [];
      let remarks = 0;
      for (const update of report.updates) {
        const at = Date.parse(update.created_at);
        expect(at).toBeGreaterThanOrEqual(lastTime);
        expect(at).toBeLessThanOrEqual(upperBound);
        lastTime = at;
        if (update.update_type === "assignment") {
          assignments += 1;
          expect(update.actorKey).toBe("admin");
          expect(report.staffKey).not.toBeNull();
          continue;
        }
        if (update.update_type === "photo") {
          photoEvents.push(update.details.includes("resolution") ? "resolution" : "initial");
          expect(update.actorKey === (update.details.includes("resolution") ? report.staffKey : report.ownerKey)).toBe(true);
        }
        if (update.update_type === "remark") {
          remarks += 1;
          expect(report.staffKey !== null && update.actorKey === report.staffKey).toBe(true);
        }
        if (update.update_type === "status_change") {
          expect(update.previous_status).toBe(status);
          if (update.new_status === "cancelled") {
            expect(status).toBe("pending");
            expect(update.actorKey).toBe(report.ownerKey);
          } else {
            const next: Partial<Record<DemoReport["status"], DemoReport["status"]>> = { pending: "under_review", under_review: "in_progress", in_progress: "resolved" };
            const expectedNext = next[status];
            if (!expectedNext) throw new Error(`Unexpected transition from ${status}`);
            expect(update.new_status === expectedNext).toBe(true);
            expect(update.actorKey).toMatch(/^staff-[1-4]$/);
          }
          status = update.new_status ?? status;
        }
      }
      expect(status).toBe(report.status);
      expect(assignments).toBe(report.staffKey ? 1 : 0);
      if (report.status !== "pending" && report.status !== "cancelled") {
        expect(report.updates.some((update) => update.update_type === "status_change" && update.new_status === report.status)).toBe(true);
      }
      if (report.photos.some((photo) => photo.kind === "resolution")) {
        expect(report.photos.some((photo) => photo.kind === "initial")).toBe(true);
        expect(photoEvents).toContain("resolution");
      }
      expect(photoEvents.filter((kind) => kind === "initial")).toHaveLength(report.photos.filter((photo) => photo.kind === "initial").length);
      expect(photoEvents.filter((kind) => kind === "resolution")).toHaveLength(report.photos.filter((photo) => photo.kind === "resolution").length);
      if (remarks > 0) expect(report.notifications.some((notification) => notification.userKey === report.ownerKey && notification.message.includes("inspection note"))).toBe(true);
      for (const notification of report.notifications) {
        expect(accountByKey.has(notification.userKey)).toBe(true);
        if (notification.message.includes("assigned to you")) expect(report.staffKey !== null && notification.userKey === report.staffKey).toBe(true);
        if (notification.message.includes("now ")) expect(notification.userKey).toBe(report.ownerKey);
        expect(Date.parse(notification.created_at)).toBeLessThanOrEqual(upperBound);
      }
      for (const photo of report.photos) {
        expect(photo.asset).toMatch(/^(road|streetlight|drainage|signage|sidewalk|other)-(initial|resolution)\.png$/);
        expect(Date.parse(photo.created_at)).toBeLessThanOrEqual(upperBound);
      }
      expect(Date.parse(report.updated_at)).toBeGreaterThanOrEqual(lastTime);
    }
  });

  it("rejects malformed options instead of normalizing them silently", () => {
    expect(() => generateSeed({ seed: 1.5 })).toThrow("safe integer");
    expect(() => generateSeed({ asOf: "2026-13-40" })).toThrow("YYYY-MM-DD");
  });
});
