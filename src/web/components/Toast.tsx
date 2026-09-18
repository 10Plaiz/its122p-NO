import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// Success is the only thing that speaks here.
//
// Failures already say so twice over — under the field that caused them, and in the
// banner above the button that sent them — so routing them through here as well
// would be a third copy of the same sentence. What the app had no way to say was
// that something worked: a saved remark, an uploaded photo and a changed role all
// left the screen looking exactly as it did before.

type Toast = { id: number; message: string };

const ToastContext = createContext<((message: string) => void) | null>(null);

const DISMISS_AFTER = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string) => {
    nextId.current += 1;
    setToasts((current) => [...current, { id: nextId.current, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}

      {/* Pinned clear of the content and of a phone's bottom notch. The list itself
          ignores the pointer, so it can never swallow a click meant for the page
          underneath; only the toasts within it are clickable. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-0 bottom-0 z-[1200] flex flex-col items-end gap-2 p-4"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  // Held open while it is being read or tabbed through, so it cannot vanish
  // mid-sentence. Releasing starts the clock again from the beginning.
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held) return;
    const timer = setTimeout(() => onDismiss(toast.id), DISMISS_AFTER);
    return () => clearTimeout(timer);
  }, [held, toast.id, onDismiss]);

  return (
    <div
      // Dark rather than accent: the accent is the app's error colour, and a
      // confirmation painted in it reads as something having gone wrong.
      className="toast-enter pointer-events-auto flex max-w-[min(22rem,calc(100vw-2rem))] items-start gap-3 border-2 border-text bg-text px-3 py-2 text-bg shadow-lg"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <span className="text-[13px] leading-snug">{toast.message}</span>

      <button
        type="button"
        aria-label="Dismiss this message"
        className="-mr-1 shrink-0 px-1 font-mono text-[15px] leading-none text-bg/70 hover:text-bg"
        onClick={() => onDismiss(toast.id)}
      >
        &times;
      </button>
    </div>
  );
}

// Returns `show`, called with the sentence to display: toast("Remark saved.")
export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>.");
  return show;
}
