import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "./ui.js";
import { useAuth } from "../lib/auth.js";
import {
  countdownAnnouncement,
  guestIdleStart,
  idleLimitText,
  idlePhase,
  lastActivity,
  markActivity,
  readActivity,
} from "../lib/idle.js";
import type { IdlePhase } from "../lib/idle.js";

// What counts as someone being there. Passive listeners, so none of them can
// delay scrolling.
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;

// UA-9. Mounted once, inside the router and AuthProvider. Watches for activity,
// warns after the idle limit, and acts when the warning runs out. A signed-in
// person is signed out; after an idle sign-out, in this tab or another, the page
// goes to sign-in, which explains what happened and returns them here after. A
// guest is sent back to the start, which clears any half-filled form.
export function IdleSignOut() {
  const { user, loading, ended, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<IdlePhase>({ phase: "active" });

  // While the warning is open, only its buttons count: a person reaching for the
  // mouse must see the warning, not have it vanish under them.
  const warning = useRef(false);
  const signedIn = user !== null;

  // A guest's clock starts when this tab opens and pauses after a reset until
  // there is new activity (see guestIdleStart).
  const openedAt = useRef(Date.now());
  const guestResetAt = useRef<number | null>(null);
  const hadSession = useRef(false);
  // The navigate function changes with the page; the timer should not restart.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (loading) return;
    if (signedIn && readActivity() === null) markActivity(Date.now(), true);

    const onActivity = () => {
      if (!warning.current) markActivity(Date.now());
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { capture: true, passive: true });
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, { capture: true });
    };
  }, [loading, signedIn]);

  useEffect(() => {
    warning.current = false;
    setPhase({ phase: "active" });
    if (loading) return;
    // A session that just ended has its own sign-in redirect; the guest clock
    // waits for new activity rather than also sending this tab home.
    if (!signedIn && hadSession.current) guestResetAt.current = Date.now();
    hadSession.current = signedIn;

    function tick() {
      const now = Date.now();
      let next: IdlePhase;
      if (signedIn) {
        next = idlePhase(lastActivity(now), now);
        if (next.phase === "expired") {
          signOut("idle");
          return;
        }
      } else {
        const start = guestIdleStart(lastActivity(0), openedAt.current, guestResetAt.current);
        next = start === null ? { phase: "active" } : idlePhase(start, now);
        if (next.phase === "expired") {
          guestResetAt.current = start;
          next = { phase: "active" };
          navigateRef.current("/", { replace: true });
        }
      }
      warning.current = next.phase === "warning";
      // Same phase and second: keep the old object so React skips the render.
      setPhase((current) =>
        current.phase === next.phase &&
        (next.phase !== "warning" || (current.phase === "warning" && current.secondsLeft === next.secondsLeft))
          ? current
          : next,
      );
    }

    tick();
    const timer = window.setInterval(tick, 1000);
    // A tab coming back from the background checks at once rather than waiting
    // for a throttled timer.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [loading, signedIn, signOut]);

  // Protected pages already redirect on their own; this covers the public ones
  // and keeps where they were, so signing in again brings them back. Only on the
  // moment the session ends: afterwards the person may browse public pages freely.
  const wasSignedIn = useRef(signedIn);
  useEffect(() => {
    const justEnded = wasSignedIn.current && !signedIn;
    wasSignedIn.current = signedIn;
    if (justEnded && ended === "idle" && location.pathname !== "/signin") {
      navigate("/signin", { replace: true, state: { from: location.pathname + location.search } });
    }
  }, [signedIn, ended, location.pathname, location.search, navigate]);

  if (phase.phase !== "warning") return null;

  return (
    <IdleTimeoutDialog
      secondsLeft={phase.secondsLeft}
      guest={!user}
      keepsDraft={user?.role === "citizen"}
      onStay={() => {
        warning.current = false;
        markActivity(Date.now(), true);
        setPhase({ phase: "active" });
      }}
      onLeave={() => {
        if (user) {
          signOut("idle");
          return;
        }
        guestResetAt.current = guestIdleStart(lastActivity(0), openedAt.current, null);
        warning.current = false;
        setPhase({ phase: "active" });
        navigate("/", { replace: true });
      }}
    />
  );
}

export function IdleTimeoutDialog({
  secondsLeft,
  guest = false,
  keepsDraft,
  onStay,
  onLeave,
}: {
  secondsLeft: number;
  guest?: boolean;
  keepsDraft: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  const stayRef = useRef<HTMLButtonElement>(null);
  const signOutRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the warning so a keyboard or screen reader user lands on the
  // way to stay, and goes back where it was when the warning closes.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stayRef.current?.focus();
    return () => previous?.focus();
  }, []);

  // Two buttons, so the focus trap is just a swap between them.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onStay();
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    (document.activeElement === stayRef.current ? signOutRef : stayRef).current?.focus();
  }

  const announcement = countdownAnnouncement(secondsLeft, guest);

  return (
    <div className="dialog-backdrop z-[1200] overscroll-contain" role="presentation">
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-dialog-title"
        aria-describedby="idle-dialog-body"
        onKeyDown={handleKeyDown}
      >
        <h4 id="idle-dialog-title" className="dialog-title">
          Still there?
        </h4>

        <div id="idle-dialog-body" className="dialog-body flex flex-col gap-2">
          <p className="text-[14px]">
            There has been no activity for {idleLimitText()}.{" "}
            {guest
              ? "To protect anything you typed, this page will clear and return to the start in"
              : "To protect your account, you will be signed out in"}{" "}
            <strong className="tabular-nums">
              {secondsLeft}&nbsp;{secondsLeft === 1 ? "second" : "seconds"}
            </strong>
            .
          </p>
          {keepsDraft && <p className="text-[13px] text-muted">A report you are writing is kept as a draft.</p>}
        </div>

        {/* The visible count changes every second; this announces it only at a few points. */}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement ?? ""}
        </span>

        <div className="dialog-actions flex gap-3">
          <Button ref={stayRef} type="button" variant="primary" onClick={onStay}>
            {guest ? "Stay here" : "Stay signed in"}
          </Button>
          <Button ref={signOutRef} type="button" onClick={onLeave}>
            {guest ? "Leave now" : "Sign out now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
