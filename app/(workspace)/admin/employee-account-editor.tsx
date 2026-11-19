"use client";

import { useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";

type Account = { id: string; name: string | null; email: string };

export default function EmployeeAccountEditor({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dialogId = `edit-account-${account.id}`;

  function open() {
    form.current?.reset();
    setError(null);
    setSaved(false);
    dialog.current?.showModal();
  }

  function close() {
    if (!saving) dialog.current?.close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password") || "");
    if (password !== String(values.get("confirmPassword") || "")) {
      setError("The new passwords do not match.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(account.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(values.get("name") || "").trim(),
          email: String(values.get("email") || "").trim(),
          ...(password ? { password } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to update this account.");
      dialog.current?.close();
      form.current?.reset();
      setSaved(true);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this account. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button type="button" className="secondary-button rounded-xl px-3 py-2 text-xs" aria-haspopup="dialog" aria-controls={dialogId} aria-label={`Edit account for ${account.name || account.email}`} onClick={open}>
          Edit account
        </button>
        {saved ? <span role="status" className="text-xs feedback-success-text">Account saved</span> : null}
      </div>
      <dialog ref={dialog} id={dialogId} className="workspace-task-dialog" aria-labelledby={`${dialogId}-title`} onClose={() => { form.current?.reset(); setError(null); }} onCancel={(event) => { if (saving) event.preventDefault(); }}>
        <div className="workspace-dialog-heading">
          <h2 id={`${dialogId}-title`}>Edit account</h2>
          <button type="button" aria-label="Close account editor" onClick={close} disabled={saving}><X size={19} aria-hidden="true" /></button>
        </div>
        <p className="mb-5 text-sm text-[var(--muted)]">Update the sign-in details for {account.name || account.email}.</p>
        <form ref={form} onSubmit={(event) => void submit(event)} className="workspace-task-form">
          <label className="workspace-field">Full name<input name="name" defaultValue={account.name ?? ""} required minLength={2} maxLength={100} autoComplete="off" disabled={saving} /></label>
          <label className="workspace-field">Email address<input name="email" type="email" defaultValue={account.email} required maxLength={254} autoComplete="off" disabled={saving} /></label>
          <label className="workspace-field">New password<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" disabled={saving} /><span className="workspace-field-hint">Leave blank to keep the current password. Use 12 or more characters with uppercase, lowercase, a number, and a symbol.</span></label>
          <label className="workspace-field">Confirm new password<input name="confirmPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" disabled={saving} /></label>
          <p className="field-wide text-sm text-[var(--muted)]">Changing the email or password signs this user out on all devices. Let them know their new sign-in details.</p>
          {error ? <p role="alert" className="field-wide workspace-form-error">{error}</p> : null}
          <div className="workspace-dialog-actions field-wide">
            <button type="button" className="workspace-cancel" onClick={close} disabled={saving}>Cancel</button>
            <button type="submit" className="accent-button" disabled={saving} aria-busy={saving}>{saving ? "Saving..." : "Save account"}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
