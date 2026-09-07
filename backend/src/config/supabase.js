import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// Full-access client. Bypasses Row Level Security, so every route that uses it
// must have already checked permissions in middleware. This is the only client
// used for reading and writing application data.
export const db = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Public client. Used only to sign users in, which is the one operation that
// should run with the anon key rather than the service key.
export const auth = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const PHOTO_BUCKET = "report-photos";
