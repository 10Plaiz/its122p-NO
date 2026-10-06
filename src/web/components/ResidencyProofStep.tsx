import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { PhotoPicker } from "./PhotoPicker.js";
import { useToast } from "./Toast.js";
import { Alert, Button } from "./ui.js";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { PROOF_TYPES, residencyStep, validateProof } from "../lib/residency.js";
import { useAction } from "../lib/useApi.js";
import { useUnsavedChangesWarning } from "../lib/useDraft.js";
import type { Profile } from "../lib/types.js";

// UA-8, the last step of registering and the only screen a locked citizen can use:
// new citizens after their email code, existing ones at their next sign-in, and
// anyone whose proof an administrator rejected. Sending a proof unlocks the account
// at once; an administrator reviews it afterwards. On My account ("account") the
// citizen is not locked: they send a proof for the address on file, usually just
// after changing it (UA-13), and the sign-out offer is left out.
export function ResidencyProofStep({ variant = "locked" }: { variant?: "locked" | "account" } = {}) {
  const { user: sessionUser, replaceUser, signOut } = useAuth();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  useUnsavedChangesWarning(file !== null);
  const submission = useRef<{ file: File; id: string; version: string } | null>(null);
  const [refreshedUser, setRefreshedUser] = useState<Profile | null>(null);
  const user = refreshedUser ?? sessionUser;

  const { run, pending, error, setError } = useAction((upload: NonNullable<typeof submission.current>) => {
    const form = new FormData();
    form.append("proof", upload.file);
    form.append("submission_id", upload.id);
    form.append("expected_version", upload.version);
    return api.upload<{ user: Profile }>(`/auth/me/residency-proof?submission_id=${upload.id}`, form);
  });
  const refresh = useAction(() => api.get<{ user: Profile }>("/auth/me"));
  const needsRefresh = error?.status === 409;

  if (!user) return null;
  const rejected = residencyStep(user) === "rejected";

  // KR-07: Send stays disabled until a usable file is chosen. A wrong file says
  // why at once; no file yet is explained by the drop zone itself.
  const fileError = validateProof(file);
  const shownError = (file ? fileError : undefined) ?? error?.fieldErrors.proof;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (fileError || !file || !user || pending || refresh.pending || needsRefresh) return;
    submission.current ??= { file, id: crypto.randomUUID(), version: user.residency_review_version };
    const sent = submission.current;
    const result = await run(sent);
    if (!result) return;
    if (result.user.residency_status === "verified") toast("Your residency is confirmed.");
    else if (result.user.residency_status === "rejected") toast("Your proof was not accepted. Select a new proof to try again.");
    else if (result.user.residency_proof_id !== sent.id) toast("Your account is up to date. Check the current proof.");
    else toast(variant === "account" ? "Proof sent. An administrator will review it." : "Proof sent. You can use KAMOTI while an administrator reviews it.");
    replaceUser(result.user);
    setRefreshedUser(null);
    if (submission.current === sent) {
      submission.current = null;
      setFile(null);
    }
  }

  async function refreshAccount() {
    if (pending || refresh.pending || !needsRefresh) return;
    const result = await refresh.run();
    if (!result) return;
    if (result.user.role !== "citizen" || result.user.is_active === false || result.user.residency_status === "verified") {
      replaceUser(result.user);
      return;
    }
    setRefreshedUser(result.user);
    submission.current = null;
    setError(null);
  }

  return (
    <div className="flex flex-col gap-5">
      {rejected ? (
        <Alert title="Your last proof was not accepted" tone="warning">
          {user.residency_note ?? "An administrator could not confirm your address from it."} Upload a new proof to
          continue.
        </Alert>
      ) : variant === "account" ? (
        <p className="text-[13px] leading-relaxed">
          An administrator has not yet confirmed the address on your account. Send one document that shows your name and
          this address; it replaces any proof you sent before.
        </p>
      ) : (
        <p className="text-[13px] leading-relaxed">
          KAMOTI is for people who live in Makati. Upload one document that shows your name and your Makati address.
          Your account opens as soon as it is sent; an administrator then checks it.
        </p>
      )}

      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-muted">
        <li>A utility bill (water, electricity, internet) from the last 3 months</li>
        <li>A barangay certificate or clearance</li>
        <li>A lease or a government ID with your Makati address</li>
      </ul>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <PhotoPicker
          id="proof"
          label="Proof of residency"
          purpose="A clear photo or scan where your name and address can be read."
          accept={PROOF_TYPES}
          chooseLabel="Choose a file"
          limits={"JPG, PNG, WebP, PDF · up to 5 MB"}
          hint="Only City administrators can open it. It is used to confirm your address and nothing else."
          error={shownError}
          value={file}
          onChange={(next) => {
            if (next !== file) submission.current = null;
            setFile(next);
          }}
        />

        {error && !error.fieldErrors.proof && <Alert title="Could not send your proof">{error.displayMessage}</Alert>}
        {needsRefresh && (
          <Button type="button" disabled={pending || refresh.pending} onClick={refreshAccount}>
            {refresh.pending ? "Refreshing..." : "Refresh account"}
          </Button>
        )}
        {refresh.error && <Alert title="Could not refresh your account">{refresh.error.displayMessage}</Alert>}
        {refreshedUser && (
          <Alert title="Account refreshed">
            Check this address before you send your proof: {user.address_line ?? "Address not set"}, {user.barangay ?? "Barangay not set"}.
          </Alert>
        )}

        <Button type="submit" variant="primary" block disabled={pending || refresh.pending || needsRefresh || Boolean(fileError)}>
          {pending ? "Uploading…" : "Send proof"}
        </Button>
      </form>

      {variant === "locked" && (
        <>
          <p className="text-[12px] text-muted">
            Not ready? You can sign out and finish this later. Until then, the rest of KAMOTI stays locked.
          </p>
          <Button type="button" variant="ghost" className="self-start" onClick={() => signOut()}>
            Sign out
          </Button>
        </>
      )}
    </div>
  );
}
