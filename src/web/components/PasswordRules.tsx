import { PASSWORD_RULES } from "../lib/passwords.js";

// UA-4: what a new password still needs, updated as it is typed. Each rule says
// "done" or "still needed" in words for screen readers, so the tick and colour are
// only a quicker read of the same thing. Polite, so typing is not interrupted.
export function PasswordRules({ id, value }: { id: string; value: string }) {
  return (
    <ul id={id} aria-live="polite" className="m-0 flex list-none flex-col gap-0.5 p-0 text-[12px]">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li key={rule.id} className={`flex items-center gap-1.5 ${met ? "text-success-800" : "text-muted"}`}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" className="shrink-0">
              {met ? <path d="M2 6.5 4.75 9 10 3" /> : <circle cx="6" cy="6" r="2" fill="currentColor" stroke="none" />}
            </svg>
            <span>
              {rule.label}
              <span className="sr-only">{met ? ", done" : ", still needed"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
