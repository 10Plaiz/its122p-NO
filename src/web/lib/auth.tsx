import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, api, getToken, setToken } from "./api.js";
import type { Profile, Role, Session } from "./types.js";

// Who is signed in, for the whole app. The token lives in localStorage so a reload
// keeps the session; the profile is always re-fetched from the server rather than
// cached, because a role or a deactivation can change between visits.

type AuthValue = {
  user: Profile | null;
  // Distinguishes "no session" from "still checking" — the guard must not redirect
  // to sign-in while the first /auth/me is still in flight.
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Profile>;
  register: (input: RegisterInput) => Promise<Profile>;
  signOut: () => void;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  contact_number?: string;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    // Tell the server so the sign-out reaches the activity log, but do not wait for
    // it or let it fail the sign-out — clearing the token locally is what matters,
    // and it must happen even offline.
    void api.post<void>("/auth/logout").catch(() => undefined);

    setToken(null);
    setUser(null);
  }, []);

  // On boot, trade a stored token for the current profile. Anything the server
  // rejects clears the token rather than leaving a session that cannot act.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    api
      .get<{ user: Profile }>("/auth/me")
      .then(({ user: profile }) => {
        if (!cancelled) setUser(profile);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // 401 is an expired token; 403 is a deactivated account. Both end the session.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await api.post<Session>("/auth/login", { email, password });
    setToken(session.access_token);
    setUser(session.user);
    return session.user;
  }, []);

  // Registration always creates a citizen and does not sign anyone in — the server
  // returns a profile, not a session, so the caller sends them to sign in. The new
  // profile is returned rather than discarded so callers can test for success
  // without inspecting the error state.
  const register = useCallback(async (input: RegisterInput) => {
    const { user: created } = await api.post<{ user: Profile }>("/auth/register", input);
    return created;
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, register, signOut }),
    [user, loading, signIn, register, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>.");
  return value;
}

// The server decides every permission; this only decides what to render. Any gap
// between the two is caught server-side, never here.
export function hasRole(user: Profile | null, ...roles: Role[]) {
  return user !== null && roles.includes(user.role);
}

// Where each role lands after signing in.
export function homePathFor(user: Profile): string {
  if (user.role === "admin") return "/admin";
  if (user.role === "staff") return "/staff/queue";
  return "/my-reports";
}
