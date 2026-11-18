"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, X } from "lucide-react";
import { matchesDepartment, resolveDepartmentFilter, type DepartmentOption } from "@/lib/employee-departments";

type Employee = { id: string; name: string | null; email: string; employeeProfile?: { departmentId: string | null } | null };

export function NewTaskButton({ className = "" }: { className?: string }) {
  return <button type="button" className={`accent-button workspace-new-task ${className}`} aria-haspopup="dialog" aria-controls="workspace-new-task" onClick={() => window.dispatchEvent(new Event("workspace:new-task"))}><Plus size={17} strokeWidth={1.8} aria-hidden="true" />New Task</button>;
}

export default function NewCompanyTaskDialog({ employees: allEmployees, departments = [] }: { employees: Employee[]; departments?: DepartmentOption[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const params = useSearchParams();
  const selectedDepartment = resolveDepartmentFilter(params.get("department") ?? undefined, departments);
  const employees = allEmployees.filter(employee => matchesDepartment(employee.employeeProfile?.departmentId, selectedDepartment));
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [repeat, setRepeat] = useState("NONE");
  const [repeatUntil, setRepeatUntil] = useState("");

  useEffect(() => {
    const show = () => { setError(null); if (!dialog.current?.open) dialog.current?.showModal(); setOpen(true); };
    window.addEventListener("workspace:new-task", show);
    return () => window.removeEventListener("workspace:new-task", show);
  }, []);
  useEffect(() => {
    if (params.get("assign") !== "1") return;
    dialog.current?.showModal(); setOpen(true);
  }, [params]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  function close() { if (!saving) dialog.current?.close(); }
  function closed() {
    setOpen(false);
    if (new URL(window.location.href).searchParams.has("assign")) {
      const url = new URL(window.location.href); url.searchParams.delete("assign"); window.history.replaceState(null, "", url);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const values = new FormData(event.currentTarget);
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/company-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        title: values.get("title"), description: values.get("description"), assigneeId: values.get("assigneeId"), priority: values.get("priority"), startDate, dueDate: repeat === "DAILY" ? startDate : endDate, repeat, repeatUntil: repeat === "DAILY" ? repeatUntil || null : null,
        checklistItems: String(values.get("checklist") || "").split(/\r?\n/).map(item => item.trim()).filter(Boolean),
      }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to create this task.");
      dialog.current?.close(); form.current?.reset(); setStartDate(""); setEndDate(""); setRepeat("NONE"); setRepeatUntil(""); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create this task. Please try again."); }
    finally { setSaving(false); }
  }

  return <dialog ref={dialog} id="workspace-new-task" className="workspace-task-dialog" aria-labelledby="new-task-title" onClose={closed} onCancel={event => { if (saving) event.preventDefault(); }}>
    <div className="workspace-dialog-heading"><h2 id="new-task-title">Create Task</h2><button type="button" aria-label="Close create task" onClick={close} disabled={saving}><X size={19} /></button></div>
    <form ref={form} onSubmit={event => void submit(event)} className="workspace-task-form">
      <label className="workspace-field field-wide">Title *<input autoFocus name="title" required minLength={2} maxLength={200} placeholder="Short descriptive title" /></label>
      <label className="workspace-field field-wide">Description<textarea name="description" maxLength={2000} rows={3} placeholder="Scope, deliverables, references…" /></label>
      <label className="workspace-field">Assign to *<select name="assigneeId" required defaultValue=""><option value="" disabled>Choose a team member</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name || employee.email}</option>)}</select></label>
      <label className="workspace-field">Priority<select name="priority" defaultValue="MEDIUM"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label>
      <label className="workspace-field field-wide">Repeat<select name="repeat" value={repeat} disabled={saving} onChange={event => setRepeat(event.target.value)}><option value="NONE">Does not repeat</option><option value="DAILY">Daily on working days</option></select></label>
      <fieldset className="field-wide grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">{repeat === "DAILY" ? "Daily schedule" : "Task date range"}</legend>
        <label className="workspace-field">{repeat === "DAILY" ? "First date *" : "Start date *"}<input name="startDate" type="date" required value={startDate} max={(repeat === "DAILY" ? repeatUntil : endDate) || undefined} onChange={(event) => setStartDate(event.target.value)} disabled={saving} /></label>
        {repeat === "DAILY" ? <label className="workspace-field">Last repeat date (optional)<input type="date" value={repeatUntil} min={startDate || undefined} onChange={event => setRepeatUntil(event.target.value)} disabled={saving} /></label> : <label className="workspace-field">End date *<input name="dueDate" type="date" required value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} disabled={saving} /></label>}
      </fieldset>
      {repeat === "DAILY" ? <p className="field-wide text-xs text-[var(--muted)]">A fresh task is created each working day, with its own checklist, submission, and review. Sundays and employee leave days are skipped. Leave the last date blank to keep repeating.</p> : null}
      <label className="workspace-field field-wide">Checklist<textarea name="checklist" rows={3} maxLength={4200} placeholder="One step per line" /><span className="workspace-field-hint">Up to 20 steps. Submitted work goes to the review queue.</span></label>
      {!employees.length ? <p className="field-wide text-sm text-[var(--muted)]">No eligible employees are available to assign work to.</p> : null}
      {error ? <p role="alert" className="field-wide workspace-form-error">{error}</p> : null}
      <div className="workspace-dialog-actions field-wide"><button type="button" className="workspace-cancel" onClick={close} disabled={saving}>Cancel</button><button type="submit" className="accent-button" disabled={saving || !employees.length} aria-busy={saving}>{saving ? "Creating…" : "Create"}</button></div>
    </form>
  </dialog>;
}
