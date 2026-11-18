"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isSunday } from "@/lib/company-workdays";

export default function EmployeeLeaveEditor({ employeeId, leaveDays, today }: {
  employeeId: string;
  leaveDays: readonly string[];
  today: string;
}) {
  const router = useRouter();
  const [day, setDay] = useState(today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const onLeave = leaveDays.includes(day);
  const holiday = isSunday(day);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!day || holiday || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(employeeId)}/leave`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, onLeave: !onLeave }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not update leave.");
      setNotice(onLeave ? `Leave removed for ${day}.` : `Leave recorded for ${day}.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update leave.");
    } finally {
      setPending(false);
    }
  }

  return <details className="mt-3 rounded-xl border border-[var(--stroke)] p-3">
    <summary className="cursor-pointer text-sm font-medium">Manage leave</summary>
    <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={save}>
      <label className="workspace-field">Leave date<input className="soft-input rounded-lg p-2" type="date" value={day} required disabled={pending} onChange={event => {
        setDay(event.target.value);
        setNotice("");
        setError("");
      }} /></label>
      <button className="secondary-button workspace-standard-button" disabled={pending || !day || holiday}>
        {pending ? "Saving…" : onLeave ? "Remove leave" : "Mark on leave"}
      </button>
    </form>
    <p className="mt-2 text-xs text-[var(--muted)]">{holiday ? "Sunday is a fixed company holiday." : onLeave ? "This date is recorded as leave." : "The date is excluded from company task days and performance. Dates use India time."}</p>
    {error ? <p role="alert" className="workspace-form-error">{error}</p> : null}
    {notice ? <p role="status" className="mt-2 text-xs text-[var(--foreground)]">{notice}</p> : null}
    {leaveDays.length ? <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-[var(--muted)]">Recorded dates</span>
      {leaveDays.map(date => <button key={date} type="button" aria-pressed={date === day} disabled={pending} onClick={() => {
        setDay(date);
        setNotice("");
        setError("");
      }} className="secondary-button px-2 py-1">{date}</button>)}
    </div> : null}
  </details>;
}
