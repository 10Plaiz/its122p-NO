import express, { Router } from "express";
import { Webhook } from "standardwebhooks";
import { env } from "../config/env.js";
import { codeMessage, sendSms } from "../lib/sms.js";
import type { Response } from "express";

// Supabase Auth hooks (Send SMS Hook for phone OTP). Mounted before express.json()
// in app.ts, because the webhook signature covers the exact bytes Supabase sent and
// a parsed-then-reserialised body would no longer match it.
const router = Router();

// Supabase reads failures from the body in this shape, not from the status alone
// (https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook).
function hookError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: { http_code: status, message } });
}

type SendSmsPayload = {
  user?: { id?: string; phone?: string; phone_change?: string };
  sms?: { otp?: string; phone?: string };
};

// The dashboard shows the secret as "v1,whsec_<base64>"; standardwebhooks wants
// only the base64 part, exactly as Supabase's own example strips it.
export function hookSecret(raw: string) {
  return raw.replace("v1,whsec_", "");
}

router.post("/send-sms", express.raw({ type: "*/*", limit: "64kb" }), async (req, res) => {
  if (!env.sendSmsHookSecret) return hookError(res, 500, "The Send SMS Hook secret is not configured on the API.");

  const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  let payload: SendSmsPayload;
  try {
    payload = new Webhook(hookSecret(env.sendSmsHookSecret)).verify(body, req.headers as Record<string, string>) as SendSmsPayload;
  } catch {
    // Anyone can reach this URL; only Supabase holds the secret. Nothing unsigned
    // gets as far as the provider, so the endpoint cannot be used to send texts.
    return hookError(res, 401, "The hook signature is missing or invalid.");
  }

  // A phone change sends the code to the NEW number. Newer Supabase versions put
  // it in sms.phone; older ones only in user.phone_change.
  const phone = payload.sms?.phone || payload.user?.phone_change || payload.user?.phone;
  const otp = payload.sms?.otp;
  if (!phone || !otp) return hookError(res, 400, "The hook payload has no phone number or code.");

  const international = phone.startsWith("+") ? phone : `+${phone}`;
  const result = await sendSms(international, codeMessage(otp));
  if (!result.ok) return hookError(res, result.status, result.message);

  res.status(200).json({});
});

export default router;
