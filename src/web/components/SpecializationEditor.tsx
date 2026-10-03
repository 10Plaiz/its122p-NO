import { useEffect, useState } from "react";
import { useToast } from "./Toast.js";
import { Alert, Button, Loading } from "./ui.js";
import { api } from "../lib/api.js";
import { useAction, useApi } from "../lib/useApi.js";
import type { Category } from "../lib/types.js";

type Specialization = Pick<Category, "id" | "name">;

// Which categories a staff member handles (SW-1). The assign dialog lists these
// people first for a report in one of their categories. Saving replaces the whole
// set; the server switches dropped ones off rather than deleting them.
//
// Made for the Users screen, one staff member at a time.
export function SpecializationEditor({
  staffId,
  staffName,
  onSaved,
}: {
  staffId: string;
  staffName: string;
  onSaved?: (specializations: Specialization[]) => void;
}) {
  const toast = useToast();
  const categories = useApi<{ categories: Category[] }>("/categories");
  const current = useApi<{ specializations: Specialization[] }>(`/staff/${staffId}/specializations`);
  const [chosen, setChosen] = useState<Set<number> | null>(null);

  // Start from what is saved, once it arrives, and again after switching person.
  useEffect(() => {
    setChosen(current.data ? new Set(current.data.specializations.map((category) => category.id)) : null);
  }, [current.data]);

  const { run, pending, error } = useAction((body: { category_ids: number[] }) =>
    // PATCH, accepted by the server as the same request as PUT (see staff.routes.ts).
    api.patch<{ specializations: Specialization[] }>(`/staff/${staffId}/specializations`, body),
  );

  if (categories.loading || current.loading || !chosen) {
    if (categories.error || current.error) {
      return (
        <Alert title="Could not load specializations">
          {(categories.error ?? current.error)?.message}
        </Alert>
      );
    }
    return <Loading label="Loading specializations" />;
  }

  const active = (categories.data?.categories ?? []).filter((category) => category.is_active);
  const saved = new Set((current.data?.specializations ?? []).map((category) => category.id));
  const changed = saved.size !== chosen.size || [...chosen].some((id) => !saved.has(id));
  const legendId = `specializations-${staffId}`;

  function toggle(id: number) {
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <fieldset className="flex flex-col gap-3 border border-divider p-4 m-0 min-w-0" aria-describedby={`${legendId}-hint`}>
      <legend className="px-1 text-[13px] font-bold text-text">Specializations for {staffName}</legend>
      <p id={`${legendId}-hint`} className="text-[12px] text-muted !m-0">
        Reports in these categories list {staffName} first when an administrator assigns them.
      </p>

      {active.length === 0 ? (
        <p className="text-[13px] text-muted !m-0">There are no active categories yet. Add one on the Categories screen.</p>
      ) : (
        <ul className="grid gap-1 sm:grid-cols-2 list-none !p-0 !m-0">
          {active.map((category) => (
            <li key={category.id}>
              <label className="flex items-center gap-2 min-h-[36px] px-1 cursor-pointer hover:bg-neutral-200">
                <input
                  type="checkbox"
                  name="category_ids"
                  value={category.id}
                  checked={chosen.has(category.id)}
                  onChange={() => toggle(category.id)}
                  className="size-4 accent-accent shrink-0"
                />
                <span className="text-[13px] min-w-0 break-words">{category.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {error && <Alert title="Could not save specializations">{error.fieldErrors.category_ids ?? error.message}</Alert>}

      <div>
        <Button
          type="button"
          variant="primary"
          disabled={pending || !changed}
          onClick={async () => {
            const result = await run({ category_ids: [...chosen] });
            if (result) {
              toast(`Specializations saved for ${staffName}.`);
              current.reload();
              onSaved?.(result.specializations);
            }
          }}
        >
          {pending ? "Saving…" : "Save specializations"}
        </Button>
      </div>
    </fieldset>
  );
}
