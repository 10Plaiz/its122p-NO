import { useCallback, useEffect, useRef, useState } from "react";

// RS-5: a form keeps a draft of what has been typed, so a reload, a dropped
// connection or an idle sign-out does not cost the citizen their report.
//
// sessionStorage rather than localStorage: the draft belongs to this tab, and it
// should not outlive the browser session on a shared or borrowed phone. Storage
// throws in some privacy modes and when full, so every access is guarded and a form
// that cannot keep a draft still works.

// Dispatched on window by the idle sign-out (UA-9) just before the session ends, so
// an open form can save at once instead of losing its last debounce window.
export const IDLE_SIGNOUT_EVENT = "kamoti:idle-signout";

export const DRAFT_PREFIX = "kamoti.draft.";

export function readDraft(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the form keeps working, it just has no draft.
  }
}

export function removeDraft(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage was never reachable.
  }
}

// Asks the browser to confirm before a reload, a closed tab or a typed URL throws
// away unsaved input. In-app links are not covered: the app uses BrowserRouter,
// which has no navigation blocker, and the draft covers that case instead.
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers only show the prompt when returnValue is set.
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

type DraftOptions<T> = {
  /** Storage key, or null while it is not known yet (no signed-in user). */
  key: string | null;
  /** What to save. Must be JSON-serialisable: never a File. */
  value: T;
  /** An empty form removes its draft rather than saving one. */
  isEmpty: (value: T) => boolean;
  /** Checks a stored value, which may be old or edited by hand. Null rejects it. */
  parse: (raw: unknown) => T | null;
  delay?: number;
};

// Saves `value` under `key` a moment after it stops changing, and offers back a
// draft found on load. While that offer is open nothing is saved, so an untouched
// form cannot overwrite the draft before the citizen decides; the choice is
// `restore` or `discard`. `clear` ends drafting after a successful submit.
export function useDraft<T>({ key, value, isEmpty, parse, delay = 600 }: DraftOptions<T>) {
  const [offer, setOffer] = useState<T | null>(null);

  const latest = useRef(value);
  latest.current = value;
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;
  const parseRef = useRef(parse);
  parseRef.current = parse;

  // Paused until the stored draft has been read and, if there was one, answered.
  const paused = useRef(true);
  const cleared = useRef(false);

  useEffect(() => {
    cleared.current = false;
    if (!key) {
      paused.current = true;
      return;
    }

    const stored = readDraft(key);
    const draft = stored === null ? null : parseRef.current(stored);
    if (draft !== null && !isEmptyRef.current(draft)) {
      paused.current = true;
      setOffer(draft);
    } else {
      if (stored !== null) removeDraft(key);
      paused.current = false;
      setOffer(null);
    }
  }, [key]);

  const save = useCallback(() => {
    if (!key || paused.current || cleared.current) return;
    if (isEmptyRef.current(latest.current)) removeDraft(key);
    else writeDraft(key, latest.current);
  }, [key]);

  // Debounced, so typing is not a storage write per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(save, delay);
    return () => window.clearTimeout(timer);
  }, [value, save, delay]);

  // Saved at once when the page is hidden or closed, when the app signs out for
  // inactivity, and when the form unmounts (an in-app link was followed).
  useEffect(() => {
    window.addEventListener(IDLE_SIGNOUT_EVENT, save);
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener(IDLE_SIGNOUT_EVENT, save);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [save]);

  const restore = useCallback(() => {
    const draft = offer;
    paused.current = false;
    setOffer(null);
    return draft;
  }, [offer]);

  const discard = useCallback(() => {
    if (key) removeDraft(key);
    paused.current = false;
    setOffer(null);
  }, [key]);

  const clear = useCallback(() => {
    cleared.current = true;
    if (key) removeDraft(key);
  }, [key]);

  return { offer, restore, discard, clear };
}
