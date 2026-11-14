"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function CreateTeamForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, managerEmail }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to create team.");
      return;
    }
    setName("");
    setManagerEmail("");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto]">
      <label className="grid gap-1 text-xs font-medium text-slate-600">
        Team name
        <input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="soft-input h-10 rounded-lg px-3 text-sm" placeholder="Product team" />
      </label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">
        Manager account
        <input required type="email" value={managerEmail} onChange={(event) => setManagerEmail(event.target.value)} className="soft-input h-10 rounded-lg px-3 text-sm" placeholder="manager@company.com" />
      </label>
      <button aria-busy={pending} disabled={pending} className="accent-button self-end px-4 py-2.5 text-xs font-semibold disabled:opacity-50">
        {pending ? "Creating…" : "Create team"}
      </button>
      {error ? <p role="alert" className="text-xs text-rose-600 sm:col-span-3">{error}</p> : null}
    </form>
  );
}
