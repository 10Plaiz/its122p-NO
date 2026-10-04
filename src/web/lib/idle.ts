// UA-9: idle sign-out. After 15 minutes with no activity in any tab, a warning
// counts down 60 seconds, then the session ends. Times are compared as timestamps
// rather than counted by an interval, so a laptop that slept through the deadline
// signs out the moment it wakes instead of resuming a paused countdown.

export const IDLE_LIMIT_MS = 15 * 60 * 1000;
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

// A screen reader hears the countdown at these points only; every second would
// drown out anything else on the page.
export function countdownAnnouncement(secondsLeft: number): string | null {
  if (secondsLeft === 60 || secondsLeft === 30 || secondsLeft === 10) {
    return `You will be signed out in ${secondsLeft} seconds.`;
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
// `now` when nothing was ever recorded (a session from before this existed).
export function lastActivity(now: number): number {
  return readActivity() ?? (lastWritten || now);
}
