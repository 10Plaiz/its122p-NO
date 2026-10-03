import { useState } from "react";
import type { FormEvent } from "react";
import { CodeInput, ResendCode } from "./EmailCode.js";
import { PasswordRules } from "./PasswordRules.js";
import { Alert, Button, Field, Input, PasswordInput, useLeftFields } from "./ui.js";
import { requestPasswordReset, resetPassword } from "../lib/auth.js";
import { validateCode, validateEmail } from "../lib/codes.js";
import { PASSWORD_MAX, validatePassword } from "../lib/passwords.js";
import { useAction } from "../lib/useApi.js";

// UA-12, inside the sign-in screen. Two steps: ask for a code by email, then enter
// it with the new password. The server answers the first step the same whether or
// not the address has an account, and the copy here says so honestly.
export function PasswordReset({
  initialEmail,
  onDone,
  onCancel,
}: {
  initialEmail: string;
  onDone: (email: string) => void;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const fields = useLeftFields();

  const request = useAction(requestPasswordReset);
  const reset = useAction(resetPassword);

  const emailError = validateEmail(email);
  const codeError = validateCode(code);
  const passwordError = validatePassword(password);

  async function handleRequest(event: FormEvent) {
    event.preventDefault();
    if (emailError) return;
    const result = await request.run(email.trim());
    // run() resolves null on failure and undefined (a 204) on success.
    if (result === null) return;
    fields.reset();
    setStage("code");
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    if (codeError || passwordError) return;
    const result = await reset.run(email.trim(), code, password);
    if (result === null) return;
    onDone(email.trim());
  }

  if (stage === "email") {
    const shown = fields.visible(emailError ? { "reset-email": emailError } : {});
    return (
      <form className="flex flex-col gap-4" onSubmit={handleRequest} onBlur={fields.onBlur} noValidate>
        <p className="text-[13px] leading-relaxed">
          Enter the email address you registered with. We will send it a 6-digit code to set a new password.
        </p>

        <Field label="Email" htmlFor="reset-email" error={shown["reset-email"] ?? request.error?.fieldErrors.email}>
          {/* Each step change moves focus to that step's first field. */}
          <Input
            autoFocus
            id="reset-email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        {request.error && !request.error.fieldErrors.email && (
          <Alert title="Could not send a reset code">{request.error.message}</Alert>
        )}

        <Button type="submit" variant="primary" block disabled={request.pending || Boolean(emailError)}>
          {request.pending ? "Sending…" : "Send reset code"}
        </Button>

        <Button type="button" variant="ghost" className="self-start" onClick={onCancel}>
          Back to sign in
        </Button>
      </form>
    );
  }

  const shown = fields.visible({
    ...(codeError ? { "reset-code": codeError } : {}),
    ...(passwordError ? { "new-password": passwordError } : {}),
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed break-words">
        If an account uses <strong translate="no">{email.trim()}</strong>, a 6-digit code is on its way to it. Enter the code and
        choose a new password. Changing it signs you out on every device.
      </p>

      <form className="flex flex-col gap-4" onSubmit={handleReset} onBlur={fields.onBlur} noValidate>
        {/* Lets a password manager file the new password under the right account. */}
        <input type="text" name="username" autoComplete="username" value={email.trim()} readOnly hidden />

        <CodeInput
          id="reset-code"
          value={code}
          onChange={setCode}
          error={shown["reset-code"] ?? reset.error?.fieldErrors.token}
          hint="The code expires 1 hour after it is sent."
        />

        <Field label="New password" htmlFor="new-password" error={shown["new-password"] ?? reset.error?.fieldErrors.password}>
          <PasswordInput
            id="new-password"
            name="new-password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            aria-describedby="new-password-rules"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <PasswordRules id="new-password-rules" value={password} />

        {reset.error && !reset.error.fieldErrors.token && !reset.error.fieldErrors.password && (
          <Alert title="Could not change your password">{reset.error.message}</Alert>
        )}

        <Button type="submit" variant="primary" block disabled={reset.pending || Boolean(codeError || passwordError)}>
          {reset.pending ? "Changing password…" : "Change password"}
        </Button>
      </form>

      <ResendCode email={email.trim()} send={() => requestPasswordReset(email.trim())} sentAtStart />

      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => {
          setCode("");
          setPassword("");
          fields.reset();
          setStage("email");
        }}
      >
        Use a different email
      </Button>
    </div>
  );
}
