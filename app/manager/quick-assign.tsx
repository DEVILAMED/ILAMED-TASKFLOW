"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TeamMember = { id: string; name: string | null; email: string };

export default function QuickAssign({ employees }: { employees: TeamMember[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState(employees[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null); setSaved(false);
    try {
      const response = await fetch("/api/company-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, assigneeId, dueDate: dueDate || null, priority }) });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to assign this task.");
      setTitle(""); setDueDate(""); setSaved(true); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to assign this task."); }
    finally { setPending(false); }
  }
  return <section className="panel-card rounded-2xl p-5"><div><p className="section-kicker">Quick action</p><h2 className="mt-1 text-base font-semibold text-[var(--foreground)]">Assign a task</h2></div>
    {employees.length ? <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-xs text-[var(--muted)] sm:col-span-2">Task title<input required minLength={2} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to get done?" className="soft-input h-10 rounded-lg px-3 text-sm" /></label>
      <label className="grid gap-1 text-xs text-[var(--muted)]">Assign to<select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="soft-input h-10 rounded-lg px-2 text-sm">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name || employee.email}</option>)}</select></label>
      <label className="grid gap-1 text-xs text-[var(--muted)]">Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="soft-input h-10 rounded-lg px-2 text-sm" /></label>
      <label className="grid gap-1 text-xs text-[var(--muted)]">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)} className="soft-input h-10 rounded-lg px-2 text-sm"><option value="LOW">Low</option><option value="MEDIUM">Normal</option><option value="HIGH">High</option></select></label>
      <div className="flex items-end gap-3"><button disabled={pending} className="accent-button h-10 px-4 text-sm font-medium disabled:opacity-50">{pending ? "Assigning…" : "Assign task"}</button>{saved ? <span role="status" className="text-xs text-emerald-600">Assigned</span> : null}</div>
      {error ? <p role="alert" className="text-xs text-rose-500 sm:col-span-2">{error}</p> : null}
    </form> : <p className="mt-3 text-sm text-[var(--muted)]">Add employees to one of your teams before assigning tasks.</p>}
  </section>;
}
