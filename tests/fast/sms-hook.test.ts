process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { Webhook } from "standardwebhooks";

// UA-6, dormant until there is an SMS budget (decided 2026-10-03). The Send SMS
// Hook must refuse anything Supabase did not sign, and answer in the error shape
// Supabase reads. No live Supabase: requests are signed here with a test secret.

const { env } = await import("../../src/server/config/env.js");
const { default: hookRouter, hookSecret } = await import("../../src/server/routes/hooks.routes.js");
const { codeMessage, smsProvider } = await import("../../src/server/lib/sms.js");

const SECRET = Buffer.from("kamoti-test-secret-kamoti-test-secret").toString("base64");
const DASHBOARD_SECRET = `v1,whsec_${SECRET}`;

let server: Server;
let base = "";
const originalSecret = env.sendSmsHookSecret;
const originalProvider = env.smsProvider;

beforeAll(async () => {
  // Mounted as app.ts mounts it: before any JSON parser.
  const app = express();
  app.use("/api/hooks", hookRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  env.sendSmsHookSecret = originalSecret;
  env.smsProvider = originalProvider;
});

function signed(body: string, secret = SECRET) {
  const id = "msg_test";
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(id, timestamp, body);
  return {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": signature,
  };
}

async function send(body: string, headers: Record<string, string>) {
  const response = await fetch(`${base}/api/hooks/send-sms`, { method: "POST", headers, body });
  return { status: response.status, body: (await response.json()) as { error?: { http_code: number; message: string } } };
}

const PAYLOAD = JSON.stringify({ user: { id: "user-1", phone: "639171234567" }, sms: { otp: "123456" } });

describe("SMS-01 the Send SMS Hook only acts on calls Supabase signed (UA-6)", () => {
  it("strips the dashboard prefix from the secret", () => {
    expect(hookSecret(DASHBOARD_SECRET)).toBe(SECRET);
  });

  it("refuses an unsigned call or one signed with another secret", async () => {
    env.sendSmsHookSecret = DASHBOARD_SECRET;
    expect((await send(PAYLOAD, { "content-type": "application/json" })).status).toBe(401);

    const forged = signed(PAYLOAD, Buffer.from("someone-else-entirely-different").toString("base64"));
    const result = await send(PAYLOAD, forged);
    expect(result.status).toBe(401);
    expect(result.body.error).toEqual({ http_code: 401, message: "The hook signature is missing or invalid." });
  });

  it("refuses a body changed after signing", async () => {
    env.sendSmsHookSecret = DASHBOARD_SECRET;
    const headers = signed(PAYLOAD);
    expect((await send(PAYLOAD.replace("123456", "999999"), headers)).status).toBe(401);
  });

  it("says plainly when no secret is configured", async () => {
    env.sendSmsHookSecret = undefined;
    expect((await send(PAYLOAD, signed(PAYLOAD))).status).toBe(500);
  });
});

describe("SMS-02 with no SMS provider, a signed call fails in Supabase's shape (UA-6)", () => {
  it("answers 501 so the citizen hears the text could not be sent", async () => {
    env.sendSmsHookSecret = DASHBOARD_SECRET;
    env.smsProvider = undefined;
    const result = await send(PAYLOAD, signed(PAYLOAD));
    expect(result.status).toBe(501);
    expect(result.body.error?.http_code).toBe(501);
  });

  it("rejects a signed payload with no number or code", async () => {
    env.sendSmsHookSecret = DASHBOARD_SECRET;
    const empty = JSON.stringify({ user: { id: "user-1" }, sms: {} });
    expect((await send(empty, signed(empty))).status).toBe(400);
  });

  it("treats an unknown provider name as a deployment mistake, not a silent drop", async () => {
    env.sendSmsHookSecret = DASHBOARD_SECRET;
    env.smsProvider = "made-up-gateway";
    expect(smsProvider("made-up-gateway")).toBeNull();
    const result = await send(PAYLOAD, signed(PAYLOAD));
    expect(result.status).toBe(500);
    expect(result.body.error?.message).toContain("made-up-gateway");
  });

  it("words the text without anything but the code", () => {
    expect(codeMessage("123456")).toBe("Your KAMOTI verification code is 123456. Do not share it with anyone.");
  });
});
