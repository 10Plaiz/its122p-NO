import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Field, Input, focusFirstError } from "../components/ui.js";
import { homePathFor, useAuth } from "../lib/auth.js";
import { useAction } from "../lib/useApi.js";

type SignInLocationState = {
  from?: string;
  registered?: boolean;
  email?: string;
};

export function SignInPage() {
  const { user, signIn, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as SignInLocationState | null;

  const { run, pending, error } = useAction(signIn);

  const [email, setEmail] = useState(state?.email ?? "");
  const [password, setPassword] = useState("");
  // Client-side checks mirror loginSchema in src/server/routes/auth.routes.ts. They
  // save a round trip; the server still rejects anything that gets past them.
  const [touched, setTouched] = useState(false);

  // A signed-in user has no reason to see this screen.
  useEffect(() => {
    if (!loading && user) {
      navigate(state?.from ?? homePathFor(user), { replace: true });
    }
  }, [loading, user, navigate, state?.from]);

  const emailError = touched && !email.trim() ? "Enter a valid email address." : undefined;
  const passwordError = touched && !password ? "Enter your password." : undefined;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!email.trim() || !password) {
      focusFirstError({
        ...(email.trim() ? {} : { email: "" }),
        ...(password ? {} : { password: "" }),
      });
      return;
    }

    const signedInUser = await run(email.trim(), password);
    if (!signedInUser) return;

    // Back to whatever they were trying to reach, or their role's home.
    navigate(state?.from ?? homePathFor(signedInUser), { replace: true });
  }

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-6 py-4">
      <h2>Sign in</h2>

      {state?.registered && (
        <div role="status" className="border border-divider bg-surface p-3 flex flex-col gap-1">
          <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-accent">
            Account created
          </span>
          <span className="text-[13px] leading-snug">
            Your account is ready. Sign in with your password to continue.
          </span>
        </div>
      )}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field label="Email" htmlFor="email" error={emailError}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={passwordError}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {error && <Alert title="Could not sign you in">{error.message}</Alert>}

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
