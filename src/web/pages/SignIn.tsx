import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { EmailCodeStep } from "../components/EmailCode.js";
import { PasswordReset } from "../components/PasswordReset.js";
import { Alert, Button, Field, Input, focusFirstError, PasswordInput } from "../components/ui.js";
import { homePathFor, useAuth } from "../lib/auth.js";
import { EMAIL_NOT_CONFIRMED, validateEmail } from "../lib/codes.js";
import { IDLE_LIMIT_MS } from "../lib/idle.js";
import { useAction } from "../lib/useApi.js";

type SignInLocationState = {
  from?: string;
  email?: string;
};

function destinationFor(user: Parameters<typeof homePathFor>[0], from?: string) {
  if (!from || from === "/signin" || from === "/register") {
    return homePathFor(user);
  }
  return from;
}

// A short message above the form: why the last session ended, or what just changed.
function Notice({ title, children, success = false }: { title: string; children: string; success?: boolean }) {
  return (
    <div role="status" className={`border p-3 flex flex-col gap-1 ${success ? "border-success-700 bg-success-100" : "border-info bg-info-100"}`}>
      <span className={`font-mono text-[9.5px] font-semibold uppercase tracking-wider ${success ? "text-success" : "text-info"}`}>{title}</span>
      <span className="text-[13px] leading-snug">{children}</span>
    </div>
  );
}

// Three modes on one screen, no extra routes: signing in, confirming an address
// that was never confirmed (UA-5), and resetting a password (UA-12, kept in the
// URL as ?step=reset so Back returns to sign-in and the link can be shared).
export function SignInPage() {
  const { user, signIn, loading, ended } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as SignInLocationState | null;
  const [searchParams] = useSearchParams();
  const resetting = searchParams.get("step") === "reset";

  const { run, pending, error } = useAction(signIn);

  const [email, setEmail] = useState(state?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  // Client-side checks mirror loginSchema in src/server/routes/auth.routes.ts. They
  // save a round trip; the server still rejects anything that gets past them.
  const [touched, setTouched] = useState(false);

  // A signed-in user has no reason to see this screen.
  useEffect(() => {
    if (!loading && user) {
      navigate(destinationFor(user, state?.from), { replace: true });
    }
  }, [loading, user, navigate, state?.from]);

  // UA-5: the right password on an unconfirmed address goes straight to the code.
  useEffect(() => {
    if (error?.code === EMAIL_NOT_CONFIRMED) setConfirming(true);
  }, [error]);

  // Empty and malformed are different problems and say so. The pattern is the one
  // the register screen applies, so the field cannot pass there and fail here.
  const emailError = touched ? validateEmail(email) : undefined;
  const passwordError = touched && !password ? "Enter your password." : undefined;
  const shownEmailError = emailError ?? error?.fieldErrors?.email;
  const shownPasswordError = passwordError ?? error?.fieldErrors?.password;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    setPasswordChanged(false);

    // Submit stays enabled even while these fail. Only the server can tell whether a
    // filled-in address and password actually match, and a disabled sign-in button is
    // the one that browser autofill strands: the fields look filled while React has
    // seen no change event, so the person is left pressing a dead control.
    const problems = {
      ...(validateEmail(email) ? { email: "" } : {}),
      ...(password ? {} : { password: "" }),
    };
    if (Object.keys(problems).length > 0) {
      focusFirstError(problems);
      return;
    }

    const signedInUser = await run(email.trim(), password);
    if (!signedInUser) return;

    // Back to whatever they were trying to reach, or their role's home.
    navigate(destinationFor(signedInUser, state?.from), { replace: true });
  }

  if (resetting) {
    return (
      <div className="max-w-sm mx-auto flex flex-col gap-6 py-4">
        <h2>Reset your password</h2>
        <PasswordReset
          initialEmail={email.trim()}
          onCancel={() => navigate("/signin", { replace: true, state })}
          onDone={(resetEmail) => {
            setEmail(resetEmail);
            setPassword("");
            setTouched(false);
            setPasswordChanged(true);
            navigate("/signin", { replace: true, state: { ...state, email: resetEmail } });
          }}
        />
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="max-w-sm mx-auto flex flex-col gap-6 py-4">
        <h2>Confirm your email</h2>
        <EmailCodeStep
          email={email.trim()}
          justSent={false}
          backLabel="Back to sign in"
          onBack={() => setConfirming(false)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-6 py-4">
      <h2>Sign in</h2>

      {passwordChanged ? (
        <Notice title="Password changed" success>Sign in with your new password.</Notice>
      ) : ended === "idle" ? (
        <Notice title="Signed out">
          {`You were signed out after ${IDLE_LIMIT_MS / 60_000} minutes without activity. Sign in to continue where you left off.`}
        </Notice>
      ) : ended === "expired" ? (
        <Notice title="Session ended">Your session has ended. Sign in again to continue.</Notice>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field label="Email" htmlFor="email" error={shownEmailError}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={shownPasswordError}>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <Link to="/signin?step=reset" state={state} className="self-start text-[13px]">
          Forgot your password?
        </Link>

        {error && error.code !== EMAIL_NOT_CONFIRMED && <Alert title="Could not sign you in">{error.message}</Alert>}

        <Button type="submit" variant="primary" block disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-muted text-[13px]">
        No account yet? <Link to="/register">Register</Link>
      </p>

      <p className="text-muted font-mono text-[10px] leading-relaxed border-t border-divider pt-3">
        One form for all three roles. Your role decides which screens load after sign-in.
      </p>
    </div>
  );
}
