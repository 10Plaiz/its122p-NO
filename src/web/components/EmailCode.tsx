import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Alert, Button, Field, Input, useLeftFields } from "./ui.js";
import { resendCode, useAuth } from "../lib/auth.js";
import { RESEND_COOLDOWN_S, normalizeCode, validateCode } from "../lib/codes.js";
import { useAction } from "../lib/useApi.js";

// UA-5, UA-12: the pieces every emailed-code screen shares. EmailCodeStep confirms
// a new account; PasswordReset uses CodeInput and ResendCode for its own code.

export function CodeInput({
  id,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <Field label="6-digit code" htmlFor={id} hint={hint} error={error}>
      {/* Not type="number": that drops leading zeros and adds a spinner. Moving
          focus here is the step change itself, so autoFocus is deliberate. */}
      <Input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        spellCheck={false}
        autoFocus
        className="font-mono tabular-nums tracking-[0.3em]"
        value={value}
        onChange={(event) => onChange(normalizeCode(event.target.value))}
      />
    </Field>
  );
}

// "Send a new code", held back for a minute after each send because Supabase
// refuses a second email to the same address sooner than that.
export function ResendCode({
  email,
  send,
  sentAtStart,
}: {
  email: string;
  send: () => Promise<void>;
  /** True when a code went out just before this mounted. */
  sentAtStart: boolean;
}) {
  const [readyAt, setReadyAt] = useState(() => (sentAtStart ? Date.now() + RESEND_COOLDOWN_S * 1000 : 0));
  const [now, setNow] = useState(() => Date.now());
  const [sent, setSent] = useState(false);
  const { run, pending, error } = useAction(send);

  const wait = Math.max(0, Math.ceil((readyAt - now) / 1000));
  const cooling = wait > 0;

  useEffect(() => {
    if (!cooling) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooling]);

  async function handleClick() {
    setSent(false);
    const result = await run();
    // run() resolves null on failure and undefined (a 204) on success.
    if (result === null) return;
    setSent(true);
    setNow(Date.now());
    setReadyAt(Date.now() + RESEND_COOLDOWN_S * 1000);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" onClick={handleClick} disabled={pending || cooling}>
          {pending ? "Sending…" : "Send a new code"}
        </Button>
        {cooling && <span className="text-muted text-[12px] tabular-nums">Available in {wait}&nbsp;s</span>}
      </div>
      <p role="status" className="text-[12px] text-muted break-words">
        {sent ? `A new code is on its way to ${email}. Check your spam folder if it does not arrive in a minute.` : ""}
      </p>
      {error && <Alert title="Could not send a new code">{error.message}</Alert>}
    </div>
  );
}

// UA-5. Shown by Register right after sign-up, and by SignIn when the address is
// not confirmed yet. A correct code signs the person in; the page around it then
// moves on, as it does after any sign-in.
export function EmailCodeStep({
  email,
  justSent,
  onBack,
  backLabel,
}: {
  email: string;
  justSent: boolean;
  onBack: () => void;
  backLabel: string;
}) {
  const { verifyEmail } = useAuth();
  const { run, pending, error } = useAction(verifyEmail);
  const [code, setCode] = useState("");
  const fields = useLeftFields();

  const codeError = validateCode(code);
  const shownError = fields.visible(codeError ? { "email-code": codeError } : {})["email-code"] ?? error?.fieldErrors.token;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (codeError) return;
    await run(email, code);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed break-words">
        {justSent ? "We sent a 6-digit code to " : "Your email address is not confirmed yet. Enter the 6-digit code we sent to "}
        <strong translate="no">{email}</strong>
        {justSent ? ". Enter it below to finish creating your account." : " when you registered, or send a new one."}
      </p>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} onBlur={fields.onBlur} noValidate>
        <CodeInput id="email-code" value={code} onChange={setCode} error={shownError} hint="The code expires 1 hour after it is sent." />

        {error && !error.fieldErrors.token && <Alert title="Could not confirm your email">{error.message}</Alert>}

        <Button type="submit" variant="primary" block disabled={pending || Boolean(codeError)}>
          {pending ? "Checking…" : "Confirm email"}
        </Button>
      </form>

      <ResendCode email={email} send={() => resendCode(email)} sentAtStart={justSent} />

      <Button type="button" variant="ghost" className="self-start" onClick={onBack}>
        {backLabel}
      </Button>
    </div>
  );
}
