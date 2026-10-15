// Loaded before every fast test (bunfig.toml). The fast suite never reaches a
// database: Supabase gets placeholder settings, and the account rate limits count
// in memory instead of in Postgres (KI-14). tests/fast/rate-limit.test.ts covers
// the Postgres store's call on its own.
process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

const { memoryLimitStore, useLimitStore } = await import("../../src/server/lib/rate-limit.js");
useLimitStore(memoryLimitStore());

export {};
