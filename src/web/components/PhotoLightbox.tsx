import { useEffect, useRef } from "react";

type PhotoLightboxProps = {
  src: string;
  alt: string;
  title?: string;
  onClose: () => void;
};

// Accessible full-resolution image modal/lightbox with keyboard (Escape) dismissal,
// backdrop dismissal, and focus management.
export function PhotoLightbox({ src, alt, title, onClose }: PhotoLightboxProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop z-[1200] bg-black/80 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || alt || "Full resolution photo view"}
        className="relative flex flex-col items-center max-w-[92vw] max-h-[92vh] bg-surface border-2 border-divider p-3 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-divider gap-4">
          <span className="font-heading font-semibold text-[13px] truncate text-text">
            {title || alt}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            className="btn btn-secondary text-[12px] py-1 px-3"
            onClick={onClose}
            aria-label="Close photo view"
          >
            Close
          </button>
        </div>

        <div className="flex items-center justify-center overflow-auto max-h-[80vh]">
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-[75vh] object-contain select-none"
          />
        </div>
      </div>
    </div>
  );
}
