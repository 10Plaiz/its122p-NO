import { useSyncExternalStore } from "react";

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

let authFailed = false;
let listening = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!listening) {
    listening = true;
    const previous = window.gm_authFailure;
    // The SDK survives route changes, so retain this callback for the session.
    window.gm_authFailure = () => {
      authFailed = true;
      for (const notify of listeners) notify();
      previous?.();
    };
  }
  return () => {
    listeners.delete(listener);
  };
}

export function useMapsAuthFailure() {
  return useSyncExternalStore(subscribe, () => authFailed, () => false);
}
