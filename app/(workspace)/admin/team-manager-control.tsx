"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type TeamManagerControlProps = {
  teamId: string;
  managerId: string;
  members: { id: string; label: string }[];
};

export default function TeamManagerControl({ teamId, managerId, members }: TeamManagerControlProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(managerId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function save() {
    setError(null);
    const response = await fetch(`/api/teams/${teamId}/manager`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to update team manager.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs font-medium text-slate-600">
        Team manager
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="soft-input h-9 max-w-64 rounded-lg px-2 text-xs">
          {members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => void save()} disabled={pending || selectedId === managerId} aria-busy={pending} className="secondary-button h-9 px-3 text-xs font-semibold disabled:opacity-50">
        {pending ? "Saving…" : "Change"}
      </button>
      {error ? <p role="alert" className="basis-full text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
