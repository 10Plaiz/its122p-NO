process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, it } from "bun:test";

// Accounts (UA-4, UA-7, UA-10, UA-11). No live Supabase: these cover how auth
// failures are worded and how the account forms are checked.

const { ACCOUNT_ERROR_CODES, accountError } = await import("../../src/server/lib/accounts-errors.js");
const { createUserSchema, updateUserSchema } = await import("../../src/server/routes/admin.routes.js");
const { limits } = await import("../../src/server/lib/rate-limit.js");

describe("ACC-01 a failed sign-in or sign-up says what happened (UA-11)", () => {
  it("turns Supabase codes into plain sentences with a fitting status", () => {
    const wrong = accountError({ code: "invalid_credentials", message: "Invalid login credentials" }, "fallback");
    expect(wrong.status).toBe(401);
    expect(wrong.message).toBe("That email and password do not match.");

    const taken = accountError({ code: "email_exists" }, "fallback");
    expect(taken.status).toBe(409);
    expect(taken.details).toEqual({ code: ACCOUNT_ERROR_CODES.alreadyRegistered });
  });

  it("tells an unconfirmed account to enter its code, with a code the screen can switch on", () => {
    const unconfirmed = accountError({ code: "email_not_confirmed" }, "fallback");
    expect(unconfirmed.message).toContain("6-digit code");
    expect(unconfirmed.details).toEqual({ code: ACCOUNT_ERROR_CODES.emailNotConfirmed });
  });

  it("treats a bare 429 as a rate limit and never shows Supabase's raw wording", () => {
    expect(accountError({ status: 429 }, "fallback").status).toBe(429);
    const unknown = accountError({ code: "something_new", message: "Raw internal text" }, "Your account could not be created.");
    expect(unknown.message).toBe("Your account could not be created.");
  });
});

describe("ACC-02 administrators create accounts with the same rules (UA-4, UA-7)", () => {
  const valid = { first_name: "Ana", last_name: "Reyes", email: "ana@example.com", password: "Str0ng!pass", role: "staff" };

  it("accepts a complete account and refuses a weak password", () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true);
    const weak = createUserSchema.safeParse({ ...valid, password: "Password1" });
    expect(weak.success).toBe(false);
    expect(weak.error?.issues[0]?.message).toBe("Include at least one special character, such as ! or #.");
  });

  it("changes a name only as a whole, first and last together", () => {
    expect(updateUserSchema.safeParse({ first_name: "Ana" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ first_name: "Ana", last_name: "Cruz" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ is_active: false }).success).toBe(true);
  });
});

describe("ACC-03 throttles exist for every secret-guessing or sending route (UA-10)", () => {
  it("defines a limiter for sign-in, sign-up, codes, and refresh", () => {
    for (const name of ["loginPerAccount", "loginPerClient", "register", "verify", "sendCode", "refresh"] as const) {
      expect(typeof limits[name]).toBe("function");
    }
  });
});
