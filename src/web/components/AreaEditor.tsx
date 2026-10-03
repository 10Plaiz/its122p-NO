import { useEffect, useState } from "react";
import { useToast } from "./Toast.js";
import { Alert, Button, Loading } from "./ui.js";
import { api } from "../lib/api.js";
import { BARANGAYS } from "../lib/barangays.js";
import { useAction, useApi } from "../lib/useApi.js";

// SW-1: the barangays a staff member covers. When an administrator assigns a report
// in one of them, this person is listed with the area matches. Sits beside
// SpecializationEditor on the Users screen and works the same way.
export function AreaEditor({ staffId, staffName }: { staffId: string; staffName: string }) {
  const toast = useToast();
  const current = useApi<{ areas: string[] }>(`/staff/${staffId}/areas`);
  const [chosen, setChosen] = useState<Set<string> | null>(null);

  // Start from what is saved, once it arrives, and again after switching person.
  useEffect(() => {
    setChosen(current.data ? new Set(current.data.areas) : null);
  }, [current.data]);

  const { run, pending, error } = useAction((body: { barangays: string[] }) =>
    api.put<{ areas: string[] }>(`/staff/${staffId}/areas`, body),
  );

  if (current.error) return <Alert title="Could not load areas">{current.error.message}</Alert>;
  if (current.loading || !chosen) return <Loading label="Loading areas" />;

  const saved = new Set(current.data?.areas ?? []);
  const changed = saved.size !== chosen.size || [...chosen].some((name) => !saved.has(name));
  const hintId = `areas-${staffId}-hint`;

  function toggle(name: string) {
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <fieldset className="flex flex-col gap-3 border border-divider p-4 m-0 min-w-0" aria-describedby={hintId}>
      <legend className="px-1 text-[13px] font-bold text-text">Areas for {staffName}</legend>
      <p id={hintId} className="text-[12px] text-muted !m-0">
        Reports pinned in these barangays list {staffName} first when an administrator assigns them.{" "}
        {chosen.size === 0 ? "No barangay chosen yet." : `${chosen.size} of ${BARANGAYS.length} chosen.`}
      </p>

      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 list-none !p-0 !m-0">
        {BARANGAYS.map((name) => (
          <li key={name}>
            <label className="flex items-center gap-2 min-h-[36px] px-1 cursor-pointer hover:bg-neutral-200">
              <input
                type="checkbox"
                name="barangays"
                value={name}
                checked={chosen.has(name)}
                onChange={() => toggle(name)}
                className="size-4 accent-accent shrink-0"
              />
              <span className="text-[13px] min-w-0 break-words">{name}</span>
            </label>
          </li>
        ))}
      </ul>

      {error && <Alert title="Could not save areas">{error.fieldErrors.barangays ?? error.message}</Alert>}

      <div>
        <Button
          type="button"
          variant="primary"
          disabled={pending || !changed}
          onClick={async () => {
            const result = await run({ barangays: [...chosen] });
            if (result) {
              toast(`Areas saved for ${staffName}.`);
              current.reload();
            }
          }}
        >
          {pending ? "Saving…" : "Save areas"}
        </Button>
      </div>
    </fieldset>
  );
}
