import { useState } from "react";
import { Alert, Button, Field, Input, Loading, focusFirstError } from "../components/ui.js";
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
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? "");
  const [nameError, setNameError] = useState<string | undefined>();

  const update = useAction((body: Record<string, unknown>) =>
    api.patch<{ category: Category }>(`/categories/${category.id}`, body),
  );
  // DELETE sets is_active = false rather than removing the row, so reports filed
  // under this category keep their category.
  const retire = useAction(() => api.delete<{ ok: true }>(`/categories/${category.id}`));

  async function save() {
    // Was a bare `return`, so Save looked broken rather than wrong.
    if (name.trim().length < 2) {
      setNameError("Enter a category name of at least 2 characters.");
      return;
    }

    setNameError(undefined);
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
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {nameError && (
              <span role="alert" className="text-[11px] text-accent-700">
                {nameError}
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
              <Button type="button" variant="primary" disabled={update.pending} onClick={save}>
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
              <Button type="button" onClick={() => setEditing(true)}>
                Edit
              </Button>
              {category.is_active ? (
                <Button
                  type="button"
                  disabled={retire.pending}
                  onClick={async () => {
                    const done = await retire.run();
                    if (done) onDone();
                  }}
                >
                  Retire
                </Button>
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
          <span className="text-[11px] text-accent-700">
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
  const [touched, setTouched] = useState(false);

  const { run, pending, error } = useAction((body: Record<string, unknown>) =>
    api.post<{ category: Category }>("/categories", body),
  );

  // Matches the server's min(2) rather than merely checking for blank, so a
  // single-character name is caught here instead of coming back as a 400.
  const nameError =
    touched && name.trim().length < 2 ? "Enter a category name of at least 2 characters." : undefined;

  return (
    <section className="border-2 border-divider p-4 flex flex-col gap-3">
      <h6>Add a category</h6>

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Name"
          htmlFor="cat-name"
          error={error?.fieldErrors?.name ?? nameError}
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
        disabled={pending}
        onClick={async () => {
          setTouched(true);
          if (name.trim().length < 2) {
            focusFirstError({ name: "" }, { name: "cat-name" });
            return;
          }

          const done = await run({
            name: name.trim(),
            ...(description.trim() ? { description: description.trim() } : {}),
          });
          if (done) {
            setName("");
            setDescription("");
            setTouched(false);
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
