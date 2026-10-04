import { env } from "../config/env.js";

// Supabase Auth does not deliver text messages itself. Its Send SMS Hook calls
// POST /api/hooks/send-sms with the code, and that route hands the message to
// whichever gateway SMS_PROVIDER names here. Swapping gateways is then a new entry
// in PROVIDERS and an environment change, with no change to the auth flow.
//
// Only `none` exists today: the team has not chosen a Philippine gateway, and a
// provider written against an API nobody has an account for would be guesswork.
// With `none`, the hook answers with Supabase's documented error shape, the
// citizen sees "could not be sent", and an administrator can confirm the number
// by hand from the Users screen. Local development never reaches this at all:
// numbers listed under [auth.sms.test_otp] in config.toml get a fixed code and
// Supabase skips both the hook and any provider for them.

export type SmsResult = { ok: true } | { ok: false; status: number; message: string };

export interface SmsProvider {
  // `phone` is international form without spaces (+639171234567).
  send(phone: string, message: string): Promise<SmsResult>;
}

const PROVIDERS: Record<string, SmsProvider> = {
  none: {
    async send() {
      return { ok: false, status: 501, message: "No SMS provider is configured for KAMOTI." };
    },
  },
};

// Unset means `none`. A name that is set but unknown is a deployment mistake and
// says so, rather than silently dropping every code.
export function smsProvider(name = env.smsProvider ?? "none"): SmsProvider | null {
  return PROVIDERS[name] ?? null;
}

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  const provider = smsProvider();
  if (!provider) {
    return { ok: false, status: 500, message: `SMS_PROVIDER "${env.smsProvider}" is not a known provider.` };
  }
  return provider.send(phone, message);
}

export function codeMessage(code: string) {
  return `Your KAMOTI verification code is ${code}. Do not share it with anyone.`;
}
