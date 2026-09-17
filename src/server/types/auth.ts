export const ROLES = ["admin", "staff", "citizen"] as const;
export type Role = (typeof ROLES)[number];
export type AuthUser = { id: string; name: string; email: string; role: Role; is_active: boolean };
