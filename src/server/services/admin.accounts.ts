import { z } from "zod";
import { db } from "../config/supabase.js";
import { rpcData } from "../lib/rpc.js";
import { ROLES } from "../types/auth.js";

const adminAccount = z.object({
  id: z.uuid(), name: z.string(), email: z.string(), role: z.enum(ROLES),
  first_name: z.string().nullable(), middle_name: z.string().nullable(), last_name: z.string().nullable(),
  suffix: z.string().nullable(), contact_number: z.string().nullable(), phone_verified_at: z.string().nullable(),
  barangay: z.string().nullable(), address_line: z.string().nullable(),
  residency_status: z.enum(["pending", "verified", "rejected"]).nullable(), residency_note: z.string().nullable(),
  is_active: z.boolean(), created_at: z.string(), residency_reviewed_at: z.string().nullable(),
  reviewer: z.object({ id: z.uuid(), name: z.string() }).nullable(), has_residency_proof: z.boolean(),
});

export async function createAccountProfile({ actorId, userId, input, ip }: {
  actorId: string; userId: string; input: Record<string, unknown>; ip?: string;
}) {
  return adminAccount.parse(rpcData(await db.rpc("admin_create_profile", {
    p_actor_id: actorId, p_user_id: userId, p_input: input, p_ip: ip ?? null,
  }), "The login was created, but its profile and audit record could not be saved."));
}

export async function changeAccount({ actorId, userId, action, input, ip }: {
  actorId: string; userId: string;
  action: "user.updated" | "residency.reviewed" | "user.phone_verified" | "user.phone_unverified";
  input: Record<string, unknown>; ip?: string;
}) {
  return adminAccount.parse(rpcData(await db.rpc("admin_change_profile", {
    p_actor_id: actorId, p_user_id: userId, p_action: action, p_input: input, p_ip: ip ?? null,
  }), "The account change could not be saved. Nothing was changed."));
}
