import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { canonicalSuffix, SUFFIXES } from "../lib/names.js";
import { Field, fieldNoteId } from "./ui.js";
import "./SuffixField.css";

const GROUPS = [
  { label: "Junior / senior", values: SUFFIXES.filter((suffix) => suffix.endsWith(".")) },
  { label: "Generation", values: SUFFIXES.filter((suffix) => !suffix.endsWith(".")) },
];

type Menu = { query: string; side: "above" | "below"; maxHeight: number };

function matches(suffix: string, query: string) {
  return suffix.toLowerCase().replace(".", "").startsWith(query.trim().toLowerCase().replace(/\.$/, ""));
}

export function SuffixField({ id, value, onChange, error }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const control = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const menuId = `${id}-options`;
  const choices = SUFFIXES.filter((suffix) => matches(suffix, menu?.query ?? ""));

  function position() {
    const bounds = control.current?.getBoundingClientRect();
    const above = bounds ? bounds.top - 8 : 240;
    const below = bounds ? window.innerHeight - bounds.bottom - 8 : 240;
    const side: Menu["side"] = below >= 240 || below >= above ? "below" : "above";
    return { side, maxHeight: Math.max(80, side === "above" ? above : below) };
  }

  function show(query = "", focus = false) {
    setMenu({ query, ...position() });
    if (focus) requestAnimationFrame(() => control.current?.querySelector<HTMLButtonElement>("[data-suffix-choice]")?.focus());
  }

  function choose(suffix: string) {
    onChange(suffix);
    setMenu(null);
    input.current?.focus();
  }

  useEffect(() => {
    if (!menu) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !control.current?.contains(event.target)) setMenu(null);
    }
    function reposition() {
      setMenu((current) => current && { ...current, ...position() });
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [Boolean(menu)]);

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && menu) {
      event.preventDefault();
      event.stopPropagation();
      setMenu(null);
      input.current?.focus();
    } else if (event.target === input.current && event.key === "ArrowDown") {
      event.preventDefault();
      show(menu?.query ?? "", true);
    } else if (event.target === input.current && event.key === "Enter" && menu) {
      event.preventDefault();
      if (menu.query && choices.length === 1) choose(choices[0]);
      else setMenu(null);
    } else if (event.target instanceof HTMLButtonElement && event.target.hasAttribute("data-suffix-choice")) {
      const buttons = Array.from(control.current?.querySelectorAll<HTMLButtonElement>("[data-suffix-choice]") ?? []);
      const current = buttons.indexOf(event.target);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : event.key === "ArrowDown" || event.key === "ArrowRight" ? (current + 1) % buttons.length
        : event.key === "ArrowUp" || event.key === "ArrowLeft" ? (current - 1 + buttons.length) % buttons.length : null;
      if (next !== null) { event.preventDefault(); buttons[next]?.focus(); }
    }
  }

  return (
    <Field label="Suffix" htmlFor={id} error={error}>
      <div ref={control} className="suffix-control" onKeyDown={keyboard}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null); }}>
        <input ref={input} id={id} name="suffix" autoComplete="honorific-suffix" maxLength={12}
          className="input suffix-input" value={value} placeholder="e.g. Jr."
          aria-invalid={error ? true : undefined} aria-describedby={error ? fieldNoteId(id) : undefined}
          onClick={() => show()} onChange={(event) => { onChange(event.target.value); show(event.target.value); }} />
        <button type="button" className="suffix-toggle" aria-label={menu ? "Hide suffix options" : "Show suffix options"}
          aria-expanded={Boolean(menu)} aria-controls={menu ? menuId : undefined}
          onClick={() => { if (menu) { setMenu(null); input.current?.focus(); } else show(); }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
        </button>
        {menu && (
          <div id={menuId} role="group" aria-label="Suffix suggestions" className="suffix-menu"
            data-side={menu.side} style={{ maxHeight: menu.maxHeight }}>
            {GROUPS.map((group, index) => {
              const visible = group.values.filter((suffix) => choices.includes(suffix));
              return visible.length > 0 && (
                <div key={group.label} role="group" aria-labelledby={`${menuId}-${index}`}>
                  <p id={`${menuId}-${index}`} className="suffix-group-label">{group.label}</p>
                  <div className={`suffix-choices ${index === 0 ? "suffix-choices-two" : ""}`}>
                    {visible.map((suffix) => (
                      <button key={suffix} type="button" data-suffix-choice aria-pressed={canonicalSuffix(value) === suffix}
                        onClick={() => choose(suffix)}>{suffix}</button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!choices.length && <p className="suffix-empty" role="status">Use Jr., Sr., II, III, IV, or V.</p>}
            <button type="button" data-suffix-choice className="suffix-clear" aria-pressed={!value}
              onClick={() => choose("")}>No suffix</button>
          </div>
        )}
      </div>
    </Field>
  );
}
