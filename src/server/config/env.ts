import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  supabaseUrl: required("SUPABASE_URL"),
  supabasePublishableKey: required("SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  // Optional. Phone OTP: Supabase's Send SMS Hook signs its calls with this secret,
  // and the provider settings pick which SMS gateway delivers the code. Without
  // them, phone numbers stay unverified until an admin confirms them.
  sendSmsHookSecret: process.env.SEND_SMS_HOOK_SECRET,
  smsProvider: process.env.SMS_PROVIDER,
  smsApiKey: process.env.SMS_API_KEY,
};
