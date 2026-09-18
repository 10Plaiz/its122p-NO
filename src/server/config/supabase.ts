import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// Full-access client. Bypasses Row Level Security, so every route that uses it
// must have already checked permissions in middleware. This is the only client
// used for reading and writing application data.
export const db = createClient(env.supabaseUrl, env.supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Public client. Used only to sign users in, which is the one operation that
// should run with the publishable key rather than the secret key.
export const auth = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const PHOTO_BUCKET = "report-photos";
