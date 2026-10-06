import { z } from "zod";
import { db } from "../config/supabase.js";
import { rpcData } from "../lib/rpc.js";
import { accountProfileSchema } from "../lib/accounts-profile.js";

export const adminAccount = accountProfileSchema.extend({
  created_at: z.string(), residency_reviewed_at: z.string().nullable(),
  reviewer: z.object({ id: z.uuid(), name: z.string() }).nullable(),
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
