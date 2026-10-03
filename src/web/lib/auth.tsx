import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ApiError,
  EXPIRES_KEY,
  RESIDENCY_REQUIRED_EVENT,
  SESSION_REFRESHED_EVENT,
  TOKEN_KEY,
  api,
  clearSession,
  getExpiresAt,
  getToken,
  refreshDelay,
  refreshSession,
  storeSession,
} from "./api.js";
import { clearActivity, markActivity } from "./idle.js";
import { IDLE_SIGNOUT_EVENT } from "./useDraft.js";
import type { Profile, Role, Session } from "./types.js";

// Who is signed in, for the whole app. The session lives in localStorage so a
// reload keeps it; the profile is always re-fetched from the server rather than
// cached, because a role or a deactivation can change between visits.

// Why the last session ended, so the sign-in screen can say so. "signout" is the
// person's own choice and needs no message.
export type EndReason = "idle" | "expired" | "signout";

// Written just before the session keys are cleared, so another tab that sees the
// token disappear knows why (UA-9: one idle sign-out ends every tab).
const END_REASON_KEY = "kamoti.ended";

type AuthValue = {
  user: Profile | null;
  // Distinguishes "no session" from "still checking" — the guard must not redirect
  // to sign-in while the first /auth/me is still in flight.
  loading: boolean;
  ended: EndReason | null;
  signIn: (email: string, password: string) => Promise<Profile>;
  register: (input: RegisterInput) => Promise<{ email: string }>;
  verifyEmail: (email: string, token: string) => Promise<Profile>;
  signOut: (reason?: EndReason) => void;
  // UA-8: after the citizen's own upload, which returns their updated account.
  replaceUser: (profile: Profile) => void;
};

// Mirrors registerSchema in src/server/routes/auth.routes.ts.
export type RegisterInput = {
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  email: string;
  password: string;
  contact_number?: string;
  barangay: string;
  address_line: string;
  privacy_consent: true;
};

// UA-5, UA-12. These start no session, so they need nothing from the context.
export function resendCode(email: string) {
  return api.post<void>("/auth/resend-code", { email });
}

export function requestPasswordReset(email: string) {
  return api.post<void>("/auth/forgot-password", { email });
}

export function resetPassword(email: string, token: string, password: string) {
  return api.post<void>("/auth/reset-password", { email, token, password });
}

function readEndReason(): EndReason | null {
  try {
    const value = localStorage.getItem(END_REASON_KEY);
    return value === "idle" || value === "expired" || value === "signout" ? value : null;
  } catch {
    return null;
  }
}

function writeEndReason(reason: EndReason | null) {
  try {
    if (reason) localStorage.setItem(END_REASON_KEY, reason);
    else localStorage.removeItem(END_REASON_KEY);
  } catch {
    // Other tabs still sign out; they just cannot say why.
  }
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState<EndReason | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(() => getExpiresAt());

  // Ends the session in this tab. Shared by a sign-out here, one seen from another
  // tab, and a session the server refused.
  const endLocally = useCallback((reason: EndReason) => {
    // An open report form saves its draft now, while it is still mounted (RS-5).
    if (reason === "idle") window.dispatchEvent(new CustomEvent(IDLE_SIGNOUT_EVENT));
    setEnded(reason);
    setExpiresAt(null);
    setUser(null);
  }, []);

  const signOut = useCallback(
    (reason: EndReason = "signout") => {
      // Tell the server so the session is revoked and the sign-out is logged, but do
      // not wait for it or let it fail the sign-out — clearing the session locally is
      // what matters, and it must happen even offline. The token is read when the
      // request starts, before clearSession() below.
      void api.post<void>("/auth/logout").catch(() => undefined);

      writeEndReason(reason);
      clearSession();
      clearActivity();
      endLocally(reason);
    },
    [endLocally],
  );

  const startSession = useCallback((session: Session) => {
    storeSession(session);
    writeEndReason(null);
    // A new session starts active, whatever an old one left behind.
    markActivity(Date.now(), true);
    setEnded(null);
    setExpiresAt(session.expires_at);
    setUser(session.user);
    return session.user;
  }, []);

  // On boot, trade a stored token for the current profile. An expired access token
  // is refreshed by api.ts first; anything still refused clears the session.
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
        // 401 is an expired session; 403 is a deactivated account. Both end it.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) clearSession();
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // A session the server refused even after a refresh, or a deactivated account.
  useEffect(() => {
    function handleSessionExpired() {
      writeEndReason("expired");
      clearSession();
      endLocally("expired");
    }
    window.addEventListener("kamoti:auth-expired", handleSessionExpired);
    return () => window.removeEventListener("kamoti:auth-expired", handleSessionExpired);
  }, [endLocally]);

  // UA-8: the server locked this citizen (an administrator rejected their proof).
  // Re-read the account so the guards send them to the upload step.
  useEffect(() => {
    function handleResidencyRequired() {
      api
        .get<{ user: Profile }>("/auth/me")
        .then(({ user: profile }) => setUser(profile))
        .catch(() => undefined);
    }
    window.addEventListener(RESIDENCY_REQUIRED_EVENT, handleResidencyRequired);
    return () => window.removeEventListener(RESIDENCY_REQUIRED_EVENT, handleResidencyRequired);
  }, []);

  // A refresh (from the timer below or a retried request) may carry a changed
  // profile, such as a new role, as well as the new expiry.
  useEffect(() => {
    function handleRefreshed(event: Event) {
      const session = (event as CustomEvent<Session>).detail;
      setExpiresAt(session.expires_at);
      setUser(session.user);
    }
    window.addEventListener(SESSION_REFRESHED_EVENT, handleRefreshed);
    return () => window.removeEventListener(SESSION_REFRESHED_EVENT, handleRefreshed);
  }, []);

  // Other tabs: a removed token is a sign-out there, and a new expiry is a refresh
  // there. `storage` fires only in the tabs that did not make the change.
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === TOKEN_KEY && event.newValue === null && user) endLocally(readEndReason() ?? "signout");
      if (event.key === EXPIRES_KEY) setExpiresAt(getExpiresAt());
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [user, endLocally]);

  // UA-9: refresh a minute before the access token runs out. A timer that the
  // browser delays (a sleeping laptop, a background tab) is covered by api.ts,
  // which refreshes and retries once when a request comes back 401.
  useEffect(() => {
    if (!user || expiresAt === null) return;
    const timer = window.setTimeout(() => void refreshSession(), refreshDelay(expiresAt, Date.now()));
    return () => window.clearTimeout(timer);
  }, [user, expiresAt]);

  const signIn = useCallback(
    async (email: string, password: string) => startSession(await api.post<Session>("/auth/login", { email, password })),
    [startSession],
  );

  // UA-5: registering starts the account and emails a code. Nobody is signed in
  // until verifyEmail accepts that code.
  const register = useCallback((input: RegisterInput) => api.post<{ email: string }>("/auth/register", input), []);

  const verifyEmail = useCallback(
    async (email: string, token: string) =>
      startSession(await api.post<Session>("/auth/verify-email", { email, token })),
    [startSession],
  );

  const replaceUser = useCallback((profile: Profile) => setUser(profile), []);

  const value = useMemo(
    () => ({ user, loading, ended, signIn, register, verifyEmail, signOut, replaceUser }),
    [user, loading, ended, signIn, register, verifyEmail, signOut, replaceUser],
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
