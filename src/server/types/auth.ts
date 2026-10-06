export const ROLES = ["admin", "staff", "citizen"] as const;
export type Role = (typeof ROLES)[number];
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  // UA-8. Only meaningful for citizens; see residencyStep in lib/residency.ts.
  residency_status?: "pending" | "verified" | "rejected" | null;
  has_residency_proof?: boolean;
  residency_review_version?: string;
  residency_proof_id?: string | null;
};
