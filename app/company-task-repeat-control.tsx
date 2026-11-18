"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { CompanyTaskRepeatInfo } from "@/lib/company-task-repeat";

export default function CompanyTaskRepeatControl({ task }: { task: CompanyTaskRepeatInfo & { id: string } }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [repeatUntil, setRepeatUntil] = useState("");

  async function save(repeat: "DAILY" | "NONE", event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (saving || refreshing) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/company-tasks/${task.id}/repeat`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repeat, ...(repeat === "DAILY" ? { repeatUntil: repeatUntil || null } : {}) }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to update daily repeat.");
      startTransition(() => router.refresh());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update daily repeat."); }
    finally { setSaving(false); }
  }

  return <section className="rounded-xl border border-[var(--stroke)] p-3 text-sm" aria-label="Task repeat schedule">
    {task.recurrenceId ? <>
      <p className="font-medium">{task.recurrence?.isActive ? "Repeats daily on working days" : "Daily repeat inactive"}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">Sundays and employee leave are skipped. Each day has a separate submission and review.{task.recurrence?.endDate ? ` Last repeat date: ${task.recurrence.endDate.slice(0, 10)}.` : ""}</p>
      {task.recurrence?.isActive ? <button type="button" disabled={saving || refreshing} className="secondary-button mt-3 px-3 py-2 text-xs" onClick={() => void save("NONE")}>Stop daily repeat</button> : null}
    </> : <details><summary className="cursor-pointer font-medium">Set up daily repeat</summary>
      <form className="mt-3 grid gap-3" onSubmit={event => void save("DAILY", event)}>
        <p className="text-xs text-[var(--muted)]">Create a fresh copy from the next working day, skipping Sundays and employee leave. This task and its existing submissions stay as they are.</p>
        <label className="workspace-field">Last repeat date (optional)<input type="date" value={repeatUntil} onChange={event => setRepeatUntil(event.target.value)} disabled={saving || refreshing} /></label>
        <button className="accent-button justify-self-start px-3 py-2 text-sm" disabled={saving || refreshing} aria-busy={saving || refreshing}>Repeat daily</button>
      </form>
    </details>}
    {error ? <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
  </section>;
}
