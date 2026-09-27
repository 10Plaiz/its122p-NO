import { createHash } from "node:crypto";

export const DEMO_DATASET = "makati-demo-v1";
const NAMESPACE = "makati-demo-v1";

const CATEGORIES = ["Road", "Streetlight", "Drainage", "Signage", "Sidewalk", "Other"] as const;
const STATUSES = ["pending", "under_review", "in_progress", "resolved", "cancelled"] as const;
const AREAS = [
  { name: "Ayala Avenue", latitude: 14.5547, longitude: 121.0244 },
  { name: "Legazpi Village", latitude: 14.5513, longitude: 121.0198 },
  { name: "Salcedo Village", latitude: 14.5607, longitude: 121.0248 },
  { name: "Poblacion", latitude: 14.5658, longitude: 121.0314 },
  { name: "Bel-Air", latitude: 14.563, longitude: 121.028 },
  { name: "San Lorenzo", latitude: 14.548, longitude: 121.023 },
] as const;

const INCIDENTS: Record<Category, { title: string; description: string }[]> = {
  Road: [
    { title: "Uneven pavement beside the curb", description: "A sunken patch of pavement creates a sharp bump for bicycles and passing vehicles." },
    { title: "Loose road cover near the lane", description: "A metal utility cover shifts when vehicles pass and may need inspection and securing." },
    { title: "Worn lane marking at the crossing", description: "The painted lane marking is difficult to see and may need repainting for clearer turns." },
    { title: "Small pothole near the intersection", description: "A shallow pothole is growing at the edge of the lane and collects water after rain." },
  ],
  Streetlight: [
    { title: "Streetlight appears unlit after dusk", description: "The lamp along the sidewalk did not appear illuminated during an evening walk." },
    { title: "Streetlight flickers intermittently", description: "The light turns on and off at intervals and may need an electrical inspection." },
    { title: "Damaged streetlight access panel", description: "The access panel looks loose from the walkway and should be checked by the maintenance team." },
    { title: "Dark stretch between two lamps", description: "A section of the pedestrian path appears dim compared with nearby lights after sunset." },
  ],
  Drainage: [
    { title: "Drain inlet partly blocked by leaves", description: "Leaves cover part of the drain opening, which may slow runoff during heavy rain." },
    { title: "Water remains beside the drain", description: "A shallow puddle remains around the inlet after rainfall and may indicate a blockage." },
    { title: "Drain grate sits unevenly", description: "One edge of the grate appears raised above the pavement and could be a trip hazard." },
    { title: "Drain opening needs clearing", description: "Debris is visible inside the curb inlet and may need routine clearing." },
  ],
  Signage: [
    { title: "Road sign is difficult to read", description: "The sign face looks faded from the sidewalk and may need cleaning or replacement." },
    { title: "Street sign partly obscured", description: "Nearby branches partly cover the street name sign and make it harder to spot." },
    { title: "Loose signpost at the sidewalk edge", description: "The signpost appears to move slightly and may need its base checked." },
    { title: "Crossing sign appears tilted", description: "The pedestrian crossing sign is angled away from approaching foot traffic." },
  ],
  Sidewalk: [
    { title: "Raised sidewalk slab near the curb", description: "One pavement slab sits higher than the next and may catch a pedestrian's foot." },
    { title: "Cracked section of walkway", description: "A crack crosses the walking surface and may need patching before it widens." },
    { title: "Narrow passage beside street works", description: "Temporary materials reduce the clear walking width and may need to be moved or marked." },
    { title: "Missing tactile paving tile", description: "A tactile tile is missing from the walkway and may need replacement." },
  ],
  Other: [
    { title: "Public fixture needs a safety check", description: "A public fixture near the walkway looks loose and may need a routine safety inspection." },
    { title: "Debris left beside the footpath", description: "A small pile of discarded material narrows the path and may need collection." },
    { title: "Public bench has a loose board", description: "One board on the bench appears loose and may need tightening before public use." },
    { title: "Guardrail paint is peeling", description: "Paint is peeling from a short rail beside the walkway and may need maintenance." },
  ],
};

const FIRST_NAMES = ["Ana", "Ben", "Carlo", "Dina", "Emil", "Farah", "Gio", "Hana", "Ira", "Jules"] as const;
const LAST_NAMES = ["Santos", "Reyes", "Cruz", "Garcia", "Lim", "Mendoza", "Navarro", "Ramos", "Tan", "Villanueva"] as const;

type Role = "citizen" | "staff" | "admin";
type Status = (typeof STATUSES)[number];
type Category = (typeof CATEGORIES)[number];
type UpdateType = "status_change" | "assignment" | "remark" | "photo";

export type DemoSeedOptions = { seed?: number; asOf?: string };

export type Account = {
  key: string;
  email: string;
  name: string;
  role: Role;
  created_at: string;
};

export type ReportUpdate = {
  id: string;
  actorKey: string;
  update_type: UpdateType;
  previous_status: Status | null;
  new_status: Status | null;
  details: string;
  created_at: string;
};

export type DemoReport = {
  id: string;
  key: string;
  ownerKey: string;
  staffKey: string | null;
  category: Category;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  address_text: string;
  status: Status;
  is_public: boolean;
  submitted_at: string;
  updated_at: string;
  resolved_at: string | null;
  updates: ReportUpdate[];
  notifications: { id: string; userKey: string; message: string; is_read: boolean; created_at: string }[];
  photos: { id: string; kind: "initial" | "resolution"; uploadedByKey: string; asset: string; created_at: string }[];
};

export type DemoSeed = {
  dataset: string;
  seed: number;
  asOf: string;
  accounts: Account[];
  reports: DemoReport[];
};

export function stableId(key: string): string {
  const bytes = createHash("sha256").update(`${NAMESPACE}:${key}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function random(seed: number): () => number {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function statusFor(index: number): Status {
  if (index < 30) return "pending";
  if (index < 60) return "under_review";
  if (index < 90) return "in_progress";
  if (index < 140) return "resolved";
  return "cancelled";
}

function transitions(status: Status): Status[] {
  switch (status) {
    case "pending": return [];
    case "under_review": return ["under_review"];
    case "in_progress": return ["under_review", "in_progress"];
    case "resolved": return ["under_review", "in_progress", "resolved"];
    case "cancelled": return ["cancelled"];
  }
}

export function generateSeed({ seed = 42, asOf = "2026-09-27" }: DemoSeedOptions = {}): DemoSeed {
  if (!Number.isSafeInteger(seed)) throw new Error("seed must be a safe integer");
  const asOfMidnight = Date.parse(`${asOf}T00:00:00.000Z`);
  if (!Number.isFinite(asOfMidnight) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || new Date(asOfMidnight).toISOString().slice(0, 10) !== asOf) throw new Error("asOf must be a valid YYYY-MM-DD date");
  const randomValue = random(seed);
  const sixMonthsAgo = Date.parse(`${asOf}T00:00:00.000Z`) - 183 * 24 * 60 * 60 * 1000;
  const accounts: Account[] = [
    { key: "admin", email: "demo-makati-admin@kamoti.invalid", name: "Demo Makati Administrator", role: "admin", created_at: iso(sixMonthsAgo - 14 * 86400000) },
    ...Array.from({ length: 5 }, (_, i) => ({ key: `staff-${i + 1}`, email: `demo-makati-staff-${i + 1}@kamoti.invalid`, name: `Demo Makati Staff ${i + 1}`, role: "staff" as const, created_at: iso(sixMonthsAgo - (12 - i) * 86400000) })),
    ...Array.from({ length: 30 }, (_, i) => ({ key: `citizen-${i + 1}`, email: `demo-makati-citizen-${i + 1}@kamoti.invalid`, name: `Demo ${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(i / FIRST_NAMES.length)]}`, role: "citizen" as const, created_at: iso(sixMonthsAgo - Math.floor(randomValue() * 10) * 86400000) })),
  ];

  const reports: DemoReport[] = Array.from({ length: 150 }, (_, i) => {
    const index = i + 1;
    const key = `report-${String(index).padStart(3, "0")}`;
    const status = statusFor(i);
    const category = CATEGORIES[i % CATEGORIES.length] ?? "Other";
    const incident = INCIDENTS[category][Math.floor(randomValue() * INCIDENTS[category].length)] ?? INCIDENTS[category][0]!;
    const area = AREAS[Math.floor(randomValue() * AREAS.length)] ?? AREAS[0];
    const ownerNumber = i < 30 ? (i % 30) + 1 : Math.floor(Math.pow(randomValue(), 1.65) * 30) + 1;
    const ownerKey = `citizen-${ownerNumber}`;
    const staffPattern = [1, 1, 1, 2, 2, 3, 4] as const;
    const staffNumber = staffPattern[i % staffPattern.length] ?? 1;
    const staffKey = status === "cancelled" || (status === "pending" && i % 4 !== 0) ? null : `staff-${staffNumber}`;
    const ageDays = i < 30 ? Math.floor(randomValue() * 27) : Math.floor(randomValue() * 183);
    const submittedMs = Math.min(asOfMidnight - 4 * 86400000, sixMonthsAgo + (183 - ageDays) * 86400000 + Math.floor(randomValue() * 86400000));
    const availableDays = Math.min(30, (asOfMidnight - submittedMs) / 86400000);
    const finalMs = Math.min(asOfMidnight - 2_000, submittedMs + Math.floor((0.25 + randomValue() * (availableDays - 0.25)) * 86400000));
    const history: ReportUpdate[] = [];
    const notifications: DemoReport["notifications"] = [{
      id: stableId(`${key}:notice:submitted`), userKey: "admin",
      message: `A demo report near ${area.name} was filed and is waiting for assignment.`,
      is_read: status !== "pending", created_at: iso(submittedMs),
    }];
    if (staffKey) {
      const assignedAt = submittedMs + 3600000;
      history.push({ id: stableId(`${key}:assignment`), actorKey: "admin", update_type: "assignment", previous_status: null, new_status: null, details: `Assigned to ${staffKey}.`, created_at: iso(assignedAt) });
      notifications.push({ id: stableId(`${key}:notice:assignment`), userKey: staffKey, message: "A demo Makati report was assigned to you.", is_read: false, created_at: iso(assignedAt) });
      notifications.push({ id: stableId(`${key}:notice:owner-assignment`), userKey: ownerKey, message: "Your demo report has been assigned to a staff member.", is_read: status === "resolved", created_at: iso(assignedAt) });
    }
    const hasResolutionPhoto = status === "resolved" && (i + Math.floor(i / 6)) % 3 === 0;
    const hasInitialPhoto = i % 5 === 0 || hasResolutionPhoto;
    if (hasInitialPhoto) {
      history.push({ id: stableId(`${key}:photo-event:initial`), actorKey: ownerKey, update_type: "photo", previous_status: null, new_status: null, details: "Reporter added a synthetic demo photo.", created_at: iso(submittedMs + 2000) });
    }
    const phases = transitions(status);
    let previous: Status = "pending";
    const actors: string[] = status === "cancelled" ? [ownerKey] : phases.map(() => staffKey ?? "staff-1");
    phases.forEach((phase, step) => {
      const actorKey = actors[step] ?? ownerKey;
      const at = phase === "cancelled"
        ? submittedMs + Math.min(finalMs - submittedMs, 86400000)
        : submittedMs + Math.floor((finalMs - submittedMs) * (step + 1) / phases.length);
      const details = phase === "under_review" ? "Intake check: location and category are ready for staff review."
        : phase === "in_progress" ? "Work note: the maintenance team has planned an inspection or repair."
          : phase === "resolved" ? "Resolution note: demo maintenance work has been completed and checked."
            : "Cancelled by the reporter.";
      history.push({ id: stableId(`${key}:status:${phase}`), actorKey, update_type: "status_change", previous_status: previous, new_status: phase, details, created_at: iso(at) });
      if (actorKey !== ownerKey) notifications.push({ id: stableId(`${key}:notice:${phase}`), userKey: ownerKey, message: `Your demo report is now ${phase.replaceAll("_", " ")}.`, is_read: step % 2 === 0, created_at: iso(at) });
      previous = phase;
    });
    if (status === "in_progress" && i % 2 === 0) {
      const remarkAt = finalMs + 1000;
      history.push({ id: stableId(`${key}:remark`), actorKey: staffKey ?? "staff-1", update_type: "remark", previous_status: null, new_status: null, details: "Demo inspection recorded; repair work is planned.", created_at: iso(remarkAt) });
      notifications.push({ id: stableId(`${key}:notice:remark`), userKey: ownerKey, message: "A demo staff member added an inspection note to your report.", is_read: false, created_at: iso(remarkAt) });
    }
    history.sort((a, b) => a.created_at.localeCompare(b.created_at));
    notifications.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const resolvedAt = status === "resolved" ? history.find((entry) => entry.new_status === "resolved")?.created_at ?? null : null;
    const categorySlug = category.toLowerCase();
    const photos: DemoReport["photos"] = [];
    if (hasInitialPhoto) photos.push({ id: stableId(`${key}:photo:initial`), kind: "initial", uploadedByKey: ownerKey, asset: `${categorySlug}-initial.png`, created_at: iso(submittedMs + 2000) });
    if (hasResolutionPhoto) {
      const uploadedByKey = staffKey ?? "staff-1";
      const photoAt = Date.parse(resolvedAt ?? iso(finalMs)) + 1000;
      photos.push({ id: stableId(`${key}:photo:resolution`), kind: "resolution", uploadedByKey, asset: `${categorySlug}-resolution.png`, created_at: iso(photoAt) });
      history.push({ id: stableId(`${key}:photo-event:resolution`), actorKey: uploadedByKey, update_type: "photo", previous_status: null, new_status: null, details: "Staff added a synthetic demo resolution photo.", created_at: iso(photoAt) });
    }
    return {
      id: stableId(key), key, ownerKey, staffKey, category,
      title: `[DEMO] ${incident.title} near ${area.name}`,
      description: `Synthetic Makati City demo example near ${area.name}: ${incident.description} This record is illustrative and does not describe a verified incident.`,
      latitude: Number((area.latitude + (randomValue() - 0.5) * 0.001).toFixed(6)),
      longitude: Number((area.longitude + (randomValue() - 0.5) * 0.001).toFixed(6)),
      address_text: `${area.name}, Makati City (synthetic demo location)`,
      status, is_public: status === "under_review" || status === "in_progress" || status === "resolved",
      submitted_at: iso(submittedMs), updated_at: iso(Math.max(submittedMs, ...history.map((entry) => Date.parse(entry.created_at)))),
      resolved_at: resolvedAt, updates: history, notifications, photos,
    };
  });
  return { dataset: DEMO_DATASET, seed, asOf, accounts, reports };
}
