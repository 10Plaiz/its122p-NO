// UA-9: idle sign-out. After 1 minute with no activity in any tab, a warning
// counts down 60 seconds, then the session ends. A guest gets the same warning,
// then is sent back to the start, which clears any half-filled form. Times are
// compared as timestamps rather than counted by an interval, so a laptop that
// slept through the deadline acts the moment it wakes instead of resuming a
// paused countdown.

export const IDLE_LIMIT_MS = 1 * 60 * 1000;
export const WARNING_MS = 60 * 1000;

// Shared by every tab, so working in one keeps the others signed in.
const ACTIVITY_KEY = "kamoti.activity";

// Activity is written at most this often: mousemove fires many times a second,
// and the limit is measured in minutes.
const WRITE_EVERY_MS = 5 * 1000;

export type IdlePhase = { phase: "active" } | { phase: "warning"; secondsLeft: number } | { phase: "expired" };

export function idlePhase(lastActivity: number, now: number): IdlePhase {
  const idle = now - lastActivity;
  if (idle >= IDLE_LIMIT_MS + WARNING_MS) return { phase: "expired" };
  if (idle >= IDLE_LIMIT_MS) {
    return { phase: "warning", secondsLeft: Math.ceil((IDLE_LIMIT_MS + WARNING_MS - idle) / 1000) };
  }
  return { phase: "active" };
}

// When a guest's idle clock started, or null while it is paused. Activity from
// before this tab opened does not count, so a guest opening the site after a
// long break is not sent home at once. After a reset the clock waits for new
// activity, so a guest left on the start page is not warned over and over.
export function guestIdleStart(activity: number, openedAt: number, resetAt: number | null): number | null {
  const start = Math.max(activity, openedAt);
  return resetAt !== null && start <= resetAt ? null : start;
}

// "1 minute", "15 minutes".
export function idleLimitText(): string {
  const minutes = IDLE_LIMIT_MS / 60_000;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

// A screen reader hears the countdown at these points only; every second would
// drown out anything else on the page.
export function countdownAnnouncement(secondsLeft: number, guest = false): string | null {
  if (secondsLeft === 60 || secondsLeft === 30 || secondsLeft === 10) {
    return guest
      ? `This page will reset in ${secondsLeft} seconds.`
      : `You will be signed out in ${secondsLeft} seconds.`;
  }
  return null;
}

let lastWritten = 0;

export function readActivity(): number | null {
  try {
    const value = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

// `force` skips the throttle: signing in and choosing "Stay signed in" must reset
// the clock at once.
export function markActivity(now: number, force = false) {
  if (!force && now - lastWritten < WRITE_EVERY_MS) return;
  lastWritten = now;
  try {
    localStorage.setItem(ACTIVITY_KEY, String(now));
  } catch {
    // Without storage, each tab keeps its own clock through lastWritten.
  }
}

export function clearActivity() {
  lastWritten = 0;
  try {
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {
    // Nothing stored.
  }
}

// Falls back to this tab's own last write when storage is unavailable, and to
// `fallback` when nothing was ever recorded: `now` for a session from before this
// existed, 0 for a guest, whose clock then starts when the tab opened.
export function lastActivity(fallback: number): number {
  return readActivity() ?? (lastWritten || fallback);
}
