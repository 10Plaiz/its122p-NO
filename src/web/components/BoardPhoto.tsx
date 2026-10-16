import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { PhotoLightbox } from "./PhotoLightbox.js";
import { Button, PhotoFrame } from "./ui.js";

export function BoardPhoto({ src, title }: { src: string; title: string }) {
  const [state, setState] = useState<"thumbnail" | "open" | "missing">("thumbnail");
  const close = useCallback(() => setState("thumbnail"), []);
  if (state === "missing") {
    return <div role="status" className="border border-divider p-3 text-[13px]">
      <p>Photo unavailable. The report details are still available.</p>
      <Button type="button" onClick={close}>Retry photo</Button>
    </div>;
  }
  return <>
    <button type="button" className="text-left focus-visible:outline-2 focus-visible:outline-accent"
      aria-label={`Enlarge photo of ${title}`} onClick={() => setState("open")}
      onErrorCapture={() => setState("missing")}>
      <PhotoFrame src={src} alt={`Photo of ${title}`} imageClassName="h-48" />
      <span className="text-[12px] underline">Enlarge photo</span>
    </button>
    {state === "open" && createPortal(
      <div onKeyDown={(event) => {
        if (event.key === "Tab") { event.preventDefault(); event.stopPropagation(); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      }} onErrorCapture={() => setState("missing")}>
        <PhotoLightbox src={src} alt={`Photo of ${title}`} title={title} onClose={close} />
      </div>, document.body)}
  </>;
}
