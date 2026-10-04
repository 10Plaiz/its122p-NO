process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { afterEach, describe, expect, it } from "bun:test";

// Email codes, password reset, and refresh (UA-5, UA-9, UA-12). No live Supabase:
// the Auth client and the profiles table are stubbed, so these check what the API
// does with each answer Supabase can give.

const { auth, db } = await import("../../src/server/config/supabase.js");
const { ACCOUNT_ERROR_CODES } = await import("../../src/server/lib/accounts-errors.js");
const { ApiError } = await import("../../src/server/lib/errors.js");
const { VERIFICATION_OFF_ERROR, confirmEmail, refreshSession, resetPassword, startSignUp } = await import(
  "../../src/server/lib/accounts-email.js"
);
const { default: authRouter, refreshSchema, registerSchema, resetPasswordSchema, signUpMetadata, verifyEmailSchema } =
  await import("../../src/server/routes/auth.routes.js");
const { ensureProfile } = await import("../../src/server/lib/accounts-profile.js");

type Calls = Record<string, unknown[]>;
const calls: Calls = {};
const restore: Array<() => void> = [];

// Replaces one method for the length of a test and records what it was called with.
function stub<T extends object>(target: T, key: string, result: unknown) {
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = async (...args: unknown[]) => {
    (calls[key] ??= []).push(args.length === 1 ? args[0] : args);
    return typeof result === "function" ? (result as (...a: unknown[]) => unknown)(...args) : result;
  };
  restore.push(() => {
    record[key] = original;
  });
}

// Replaces db.from (synchronous in supabase-js) for the length of a test.
function stubFrom(from: (table: string) => unknown) {
  const record = db as unknown as Record<string, unknown>;
  const original = record.from;
  record.from = from;
  restore.push(() => {
    record.from = original;
  });
}

// profiles: the one table sessionResponse reads. Every builder method returns the
// builder; maybeSingle/single answer with the queued row.
function stubProfiles(row: Record<string, unknown> | null) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "insert"]) builder[method] = () => builder;
  builder.maybeSingle = async () => ({ data: row, error: null });
  builder.single = async () => ({ data: row, error: null });
  stubFrom(() => builder);
}

const PROFILE = {
  id: "user-1",
  name: "Ana Reyes",
  email: "ana@example.com",
  role: "citizen",
  is_active: true,
};
const USER = { id: "user-1", email: "ana@example.com", identities: [{ id: "identity-1" }], user_metadata: {} };
const SESSION = { access_token: "access-1", refresh_token: "refresh-1", expires_at: 1_900_000_000 };

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("Expected the call to be rejected.");
}

afterEach(() => {
  while (restore.length > 0) restore.pop()!();
  for (const key of Object.keys(calls)) delete calls[key];
});

describe("ACC-04 sign-up sends a code instead of creating a ready account (UA-5)", () => {
  const details = { email: "ana@example.com", password: "Str0ng!pass", metadata: { first_name: "Ana" } };

  it("starts the sign-up with the details on the login and creates no profile yet", async () => {
    stub(auth.auth, "signUp", { data: { user: USER, session: null }, error: null });
    let profileTouched = false;
    stubFrom(() => {
      profileTouched = true;
      return {};
    });

    expect(await startSignUp(details)).toEqual({ email: "ana@example.com" });
    expect(calls.signUp?.[0]).toEqual({
      email: "ana@example.com",
      password: "Str0ng!pass",
      options: { data: { first_name: "Ana" } },
    });
    expect(profileTouched).toBe(false);
  });

  it("says an already confirmed address is taken, though Supabase hides it", async () => {
    stub(auth.auth, "signUp", { data: { user: { ...USER, id: "made-up", identities: [] }, session: null }, error: null });
    const error = await rejection(startSignUp(details));
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ code: ACCOUNT_ERROR_CODES.alreadyRegistered });
  });

  it("never leaves an unverified account when confirmations are off", async () => {
    stub(auth.auth, "signUp", { data: { user: USER, session: SESSION }, error: null });
    stub(db.auth.admin, "deleteUser", { data: {}, error: null });
    const originalError = console.error;
    console.error = () => {};
    try {
      const error = await rejection(startSignUp(details));
      expect(error.status).toBe(503);
      expect(error.message).toBe(VERIFICATION_OFF_ERROR);
    } finally {
      console.error = originalError;
    }
    expect(calls.deleteUser?.[0]).toBe("user-1");
  });

  it("puts Supabase's own refusals in plain words", async () => {
    stub(auth.auth, "signUp", { data: { user: null, session: null }, error: { code: "over_email_send_rate_limit", status: 429 } });
    const error = await rejection(startSignUp(details));
    expect(error.status).toBe(429);
    expect(error.message).toContain("Too many emails");
  });
});

describe("ACC-05 a correct code confirms the address and signs in (UA-5)", () => {
  it("checks the code as a sign-up confirmation only", async () => {
    stub(auth.auth, "verifyOtp", { data: { user: USER, session: SESSION }, error: null });
    stubProfiles(PROFILE);

    const session = await confirmEmail("ana@example.com", "123456");
    expect(calls.verifyOtp?.[0]).toEqual({ email: "ana@example.com", token: "123456", type: "signup" });
    expect(session).toMatchObject({ access_token: "access-1", refresh_token: "refresh-1", user: { id: "user-1" } });
  });

  it("refuses a wrong or expired code with a next step", async () => {
    stub(auth.auth, "verifyOtp", { data: { user: null, session: null }, error: { code: "otp_expired", status: 403 } });
    const error = await rejection(confirmEmail("ana@example.com", "000000"));
    expect(error.status).toBe(400);
    expect(error.message).toContain("send a new code");
  });

  it("ends the new session at once for a deactivated account", async () => {
    stub(auth.auth, "verifyOtp", { data: { user: USER, session: SESSION }, error: null });
    stub(db.auth.admin, "signOut", { error: null });
    stubProfiles({ ...PROFILE, is_active: false });

    const error = await rejection(confirmEmail("ana@example.com", "123456"));
    expect(error.status).toBe(403);
    expect(calls.signOut?.[0]).toEqual(["access-1", "local"]);
  });
});

describe("ACC-06 a reset code sets a new password and ends every session (UA-12)", () => {
  it("checks the code as a recovery, sets the password, then signs out everywhere", async () => {
    stub(auth.auth, "verifyOtp", { data: { user: USER, session: SESSION }, error: null });
    stub(db.auth.admin, "updateUserById", { data: { user: USER }, error: null });
    stub(db.auth.admin, "signOut", { error: null });

    await resetPassword("ana@example.com", "654321", "N3w!password");
    expect(calls.verifyOtp?.[0]).toEqual({ email: "ana@example.com", token: "654321", type: "recovery" });
    expect(calls.updateUserById?.[0]).toEqual(["user-1", { password: "N3w!password" }]);
    expect(calls.signOut?.[0]).toEqual(["access-1", "global"]);
  });

  it("changes nothing when the code is wrong", async () => {
    stub(auth.auth, "verifyOtp", { data: { user: null, session: null }, error: { code: "otp_expired" } });
    stub(db.auth.admin, "updateUserById", { data: {}, error: null });

    const error = await rejection(resetPassword("ana@example.com", "000000", "N3w!password"));
    expect(error.status).toBe(400);
    expect(calls.updateUserById).toBeUndefined();
  });
});

describe("ACC-07 refresh keeps an active session going (UA-9)", () => {
  it("returns a new session for a valid refresh token", async () => {
    stub(auth.auth, "refreshSession", {
      data: { user: USER, session: { ...SESSION, access_token: "access-2", refresh_token: "refresh-2" } },
      error: null,
    });
    stubProfiles(PROFILE);

    const session = await refreshSession("refresh-1");
    expect(calls.refreshSession?.[0]).toEqual({ refresh_token: "refresh-1" });
    expect(session).toMatchObject({ access_token: "access-2", refresh_token: "refresh-2" });
  });

  it("answers 401 for any refresh failure, so the browser ends the session", async () => {
    stub(auth.auth, "refreshSession", { data: { user: null, session: null }, error: { code: "refresh_token_already_used" } });
    expect((await rejection(refreshSession("used"))).status).toBe(401);

    stub(auth.auth, "refreshSession", { data: { user: null, session: null }, error: { code: "something_new" } });
    expect((await rejection(refreshSession("odd"))).status).toBe(401);
  });

  it("refuses to refresh a deactivated account", async () => {
    stub(auth.auth, "refreshSession", { data: { user: USER, session: SESSION }, error: null });
    stub(db.auth.admin, "signOut", { error: null });
    stubProfiles({ ...PROFILE, is_active: false });
    expect((await rejection(refreshSession("refresh-1"))).status).toBe(403);
  });
});

describe("ACC-08 the code and refresh routes check their input (UA-5, UA-9, UA-12)", () => {
  it("accepts exactly six digits, trimming spaces from a pasted code", () => {
    expect(verifyEmailSchema.safeParse({ email: "ana@example.com", token: " 123456 " }).data?.token).toBe("123456");
    for (const token of ["12345", "1234567", "12a456", ""]) {
      const result = verifyEmailSchema.safeParse({ email: "ana@example.com", token });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Enter the 6-digit code.");
    }
  });

  it("holds a new password to the sign-up rule", () => {
    const weak = resetPasswordSchema.safeParse({ email: "ana@example.com", token: "123456", password: "password1" });
    expect(weak.success).toBe(false);
    expect(resetPasswordSchema.safeParse({ email: "ana@example.com", token: "123456", password: "Str0ng!pass" }).success).toBe(true);
  });

  it("needs a refresh token", () => {
    expect(refreshSchema.safeParse({ refresh_token: "" }).success).toBe(false);
    expect(refreshSchema.safeParse({}).success).toBe(false);
  });

  it("mounts every route behind a throttle", () => {
    type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: unknown[] } };
    const posts = (authRouter.stack as Layer[])
      .filter((layer) => layer.route?.methods.post)
      .map((layer) => [layer.route!.path, layer.route!.stack.length] as const);
    const byPath = Object.fromEntries(posts);
    for (const path of ["/register", "/verify-email", "/resend-code", "/forgot-password", "/reset-password", "/refresh"]) {
      // The throttle plus the handler, at least.
      expect(byPath[path]).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("ACC-11 every registration the form accepts can become a profile (UA-5, UA-7)", () => {
  it("rebuilds the profile from the sign-up details at the longest allowed lengths", async () => {
    const input = registerSchema.parse({
      first_name: "Ñ".repeat(50),
      middle_name: "Dela Cruz-Santos",
      last_name: "O'Brien".padEnd(50, "a"),
      suffix: "III",
      email: "ana@example.com",
      password: "Str0ng!pass",
      contact_number: "09171234567",
      barangay: "Poblacion",
      address_line: "x".repeat(200),
      privacy_consent: true,
    });

    let inserted: Record<string, unknown> | undefined;
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq"]) builder[method] = () => builder;
    builder.insert = (row: Record<string, unknown>) => {
      inserted = row;
      return builder;
    };
    builder.maybeSingle = async () => ({ data: null, error: null });
    builder.single = async () => ({ data: { ...inserted }, error: null });
    stubFrom(() => builder);

    const user = { id: "user-1", email: input.email, user_metadata: signUpMetadata(input, "2026-10-03T00:00:00.000Z") };
    await ensureProfile(user as never);
    expect(inserted).toMatchObject({
      id: "user-1",
      role: "citizen",
      first_name: input.first_name,
      suffix: "III",
      barangay: "Poblacion",
      residency_status: "pending",
      privacy_consent_at: "2026-10-03T00:00:00.000Z",
    });
  });
});
