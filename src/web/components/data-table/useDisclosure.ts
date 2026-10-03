import { useCallback, useEffect, useId, useRef, useState } from "react";

// The open/closed state of a toolbar popover (column menu, export menu): a button
// that toggles a panel, which closes on Escape or a click elsewhere. Escape hands
// focus back to the button, so a keyboard user is never left on a vanished panel.
export function useDisclosure() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close(true);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return {
    open,
    close,
    rootRef,
    triggerProps: {
      ref: triggerRef,
      "aria-expanded": open,
      "aria-controls": panelId,
      onClick: () => setOpen((value) => !value),
    },
    panelId,
  };
}

// Shared look for the panels: a surface sheet under its button. On a phone the
// toolbar wraps and a button can sit at the left edge, so the panel opens to the
// right there and aligns to the button's right edge from `sm` up.
export const PANEL_CLASS =
  "absolute left-0 top-full z-30 mt-1 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-2 border border-divider bg-surface p-3 shadow-md sm:left-auto sm:right-0";
