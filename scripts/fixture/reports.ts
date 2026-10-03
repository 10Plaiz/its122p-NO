// The fixture's reports, kept apart from seed.ts so tests can read them without
// running the seed.

export type FixtureStatus = "pending" | "under_review";

export type ReportSpec = {
  title: string;
  owner: string; // account key
  assigned: string | null; // account key
  status: FixtureStatus;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
};

// Synthetic coordinates fall inside Makati: the API and the database refuse a pin
// outside the city (MP-2), and tests/fast/makati.test.ts checks these against
// the boundary. Nothing here points at a real address.
export const REPORTS: ReportSpec[] = [
  {
    title: "[FIXTURE] Broken streetlight on Sample Avenue",
    owner: "citizen-1",
    assigned: null,
    status: "pending",
    category: "Streetlight",
    description:
      "Fixture data: the streetlight at this synthetic location has stayed unlit for several nights.",
    latitude: 14.5547,
    longitude: 121.0244,
  },
  {
    title: "[FIXTURE] Overflowing drainage canal on Test Street",
    owner: "citizen-2",
    assigned: null,
    status: "pending",
    category: "Drainage",
    description:
      "Fixture data: the drainage canal at this synthetic location is clogged and overflows after rain.",
    latitude: 14.5658,
    longitude: 121.0314,
  },
  {
    title: "[FIXTURE] Pothole cluster on Demo Boulevard",
    owner: "citizen-1",
    assigned: "staff-1",
    status: "under_review",
    category: "Road",
    description:
      "Fixture data: several deep potholes at this synthetic location damage vehicles every day.",
    latitude: 14.5513,
    longitude: 121.0198,
  },
];
