import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Field, Input, focusFirstError } from "../components/ui.js";
import { homePathFor, useAuth } from "../lib/auth.js";
import { useAction } from "../lib/useApi.js";

export function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { run, pending, error } = useAction(signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Client-side checks mirror loginSchema in src/server/routes/auth.routes.ts. They
  // save a round trip; the server still rejects anything that gets past them.
  const [touched, setTouched] = useState(false);

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

    const user = await run(email.trim(), password);
    if (!user) return;

    // Back to whatever they were trying to reach, or their role's home.
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from ?? homePathFor(user), { replace: true });
  }

  return (
    <div className="max-w-sm mx-auto flex flex-col gap-6 py-4">
      <h2>Sign in</h2>

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
