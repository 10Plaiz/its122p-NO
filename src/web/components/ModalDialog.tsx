import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";

export function ModalDialog({ children, className = "", labelledBy, describedBy, pending = false, initialFocusRef, onClose }: {
  children: ReactNode;
  className?: string;
  labelledBy: string;
  describedBy?: string;
  pending?: boolean;
  initialFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    initialFocusRef.current?.focus();
    return () => { dialog?.close(); previous?.focus(); };
  }, [initialFocusRef]);

  return (
    <dialog ref={dialogRef} className={`dialog modal-dialog max-h-[90vh] overflow-y-auto overscroll-contain ${className}`}
      aria-labelledby={labelledBy} aria-describedby={describedBy} aria-busy={pending}
      onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        )).filter((control) => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) event.preventDefault();
        else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || pending) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      {children}
    </dialog>
  );
}
