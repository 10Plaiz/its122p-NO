import { useState } from "react";
import { Alert, Button, Field, Input, Loading } from "../components/ui.js";
import { useToast } from "../components/Toast.js";
import { api } from "../lib/api.js";
import { useAction, useApi } from "../lib/useApi.js";
import type { Analytics, Category } from "../lib/types.js";

// Wireframe 1r. Per-category counts come from /api/admin/analytics, which keys
// by_category on the category NAME, so they are matched by name here.
export function AdminCategoriesPage() {
  const { data, error, loading, reload } = useApi<{ categories: Category[] }>("/categories");
  const { data: analytics } = useApi<Analytics>("/admin/analytics");

  const categories = data?.categories ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2>Categories</h2>
        <p className="text-muted text-[13px]">
          What a citizen can choose when filing. Retiring one hides it from the form without
          touching the reports already filed under it.
        </p>
      </header>

      <CreateCategory onDone={reload} />

      {error && <Alert title="Could not load categories">{error.message}</Alert>}
      {loading && <Loading label="Loading categories" />}

      {categories.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Reports</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  count={analytics?.by_category?.[category.name] ?? 0}
                  onDone={reload}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  count,
  onDone,
}: {
  category: Category;
  count: number;
  onDone: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmingRetire, setConfirmingRetire] = useState(false);
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? "");

  const update = useAction((body: Record<string, unknown>) =>
    api.patch<{ category: Category }>(`/categories/${category.id}`, body),
  );
  // DELETE sets is_active = false rather than removing the row, so reports filed
  // under this category keep their category.
  const retire = useAction(() => api.delete<{ ok: true }>(`/categories/${category.id}`));

  // Too short to be a name, or nothing actually changed: either way there is no
  // request worth sending, and Save is disabled rather than accepting the click.
  const tooShort = name.trim().length < 2;
  const unchanged =
    name.trim() === category.name && description.trim() === (category.description ?? "");

  async function save() {
    if (tooShort || unchanged) return;

    const done = await update.run({ name: name.trim(), description: description.trim() || null });
    if (done) {
      setEditing(false);
      toast("Category saved.");
      onDone();
    }
  }

  return (
    <tr>
      <td className="text-[13px]">
        {editing ? (
          <span className="flex flex-col gap-1">
            <Input
              aria-label="Category name"
              aria-invalid={tooShort || undefined}
              aria-describedby={tooShort ? `category-${category.id}-name-note` : undefined}
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {tooShort && (
              <span id={`category-${category.id}-name-note`} className="text-muted text-[11px]">
                At least 2 characters.
              </span>
            )}
          </span>
        ) : (
          category.name
        )}
      </td>
      <td className="text-[13px]">
        {editing ? (
          <Input
            aria-label="Category description"
            maxLength={300}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        ) : (
          (category.description ?? "—")
        )}
      </td>
      <td className="font-mono text-[12px]">{count}</td>
      <td className="text-[13px]">{category.is_active ? "Active" : "Retired"}</td>
      <td>
        <div className="flex gap-2 flex-wrap">
          {editing ? (
            <>
              <Button
                type="button"
                variant="primary"
                disabled={update.pending || tooShort || unchanged}
                onClick={save}
              >
                Save
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setName(category.name);
                  setDescription(category.description ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                onClick={() => {
                  // Drops a half-answered retire prompt, so leaving the editor does not
                  // bring it back as though it were still waiting.
                  setConfirmingRetire(false);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
              {category.is_active ? (
                // Retiring takes a category out of every citizen's report form, so it
                // asks first. Same inline confirm the citizen's own cancel flow uses in
                // MyReports, rather than a second pattern for the same kind of decision.
                confirmingRetire ? (
                  <>
                    <span className="text-[12px]">Retire this category?</span>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={retire.pending}
                      onClick={async () => {
                        const done = await retire.run();
                        if (done) {
                          setConfirmingRetire(false);
                          toast("Category retired. Reports filed under it are unchanged.");
                          onDone();
                        }
                      }}
                    >
                      {retire.pending ? "Retiring…" : "Yes, retire"}
                    </Button>
                    <Button type="button" onClick={() => setConfirmingRetire(false)}>
                      Keep it
                    </Button>
                  </>
                ) : (
                  <Button type="button" onClick={() => setConfirmingRetire(true)}>
                    Retire
                  </Button>
                )
              ) : (
                <Button
                  type="button"
                  disabled={update.pending}
                  onClick={async () => {
                    const done = await update.run({ is_active: true });
                    if (done) onDone();
                  }}
                >
                  Restore
                </Button>
              )}
            </>
          )}
        </div>
        {(update.error ?? retire.error) && (
          <span role="alert" className="text-[11px] text-accent-700">
            {(update.error ?? retire.error)?.message}
          </span>
        )}
      </td>
    </tr>
  );
}

function CreateCategory({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { run, pending, error } = useAction((body: Record<string, unknown>) =>
    api.post<{ category: Category }>("/categories", body),
  );

  // Matches the server's min(2) rather than merely checking for blank, so a
  // single-character name is caught here instead of coming back as a 400. Stated as a
  // requirement on the field and enforced by disabling Add, rather than reported as an
  // error after a click the form already knew would fail.
  const incomplete = name.trim().length < 2;

  return (
    <section className="border-2 border-divider p-4 flex flex-col gap-3">
      <h6>Add a category</h6>

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Name"
          htmlFor="cat-name"
          hint="At least 2 characters."
          error={error?.fieldErrors?.name}
          count={name.length}
          max={60}
        >
          <Input
            id="cat-name"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Description"
          htmlFor="cat-desc"
          hint="Optional. Shown to citizens as a hint."
          count={description.length}
          max={300}
        >
          <Input
            id="cat-desc"
            value={description}
            maxLength={300}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </div>

      {error && <Alert title="Could not add the category">{error.message}</Alert>}

      <Button
        type="button"
        variant="primary"
        disabled={pending || incomplete}
        onClick={async () => {
          if (incomplete) return;

          const done = await run({
            name: name.trim(),
            ...(description.trim() ? { description: description.trim() } : {}),
          });
          if (done) {
            setName("");
            setDescription("");
            toast("Category added.");
            onDone();
          }
        }}
      >
        {pending ? "Adding…" : "Add category"}
      </Button>
    </section>
  );
}
