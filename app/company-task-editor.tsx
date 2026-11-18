"use client";

import { useState, type FormEvent } from "react";
import type { CompanyTaskRepeatInfo } from "@/lib/company-task-repeat";

type Employee = { id: string; name: string | null; email: string };
type EditableTask = CompanyTaskRepeatInfo & { id: string; title: string; description: string | null; startDate: string | null; dueDate: string | null; priority: "LOW" | "MEDIUM" | "HIGH"; assignee: Employee | null };
export type CompanyTaskChanges = { title?: string; description?: string; startDate?: string | null; dueDate?: string | null; priority?: "LOW" | "MEDIUM" | "HIGH"; assigneeId?: string | null };

export default function CompanyTaskEditor({ task, employees, pending, onSave, onDelete }: {
  task: EditableTask;
  employees: Employee[];
  pending: boolean;
  onSave: (changes: CompanyTaskChanges) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [editingTask, setEditingTask] = useState<EditableTask | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask || pending) return;
    const values = new FormData(event.currentTarget);
    const changes: CompanyTaskChanges = {};
    const title = String(values.get("title") || "").trim();
    const description = String(values.get("description") || "").trim();
    const priority = String(values.get("priority")) as EditableTask["priority"];
    const assigneeId = String(values.get("assigneeId") || "") || null;
    if (title !== editingTask.title) changes.title = title;
    if (description !== (editingTask.description || "")) changes.description = description;
    if (startDate !== (editingTask.startDate?.slice(0, 10) || "")) changes.startDate = startDate;
    if (endDate !== (editingTask.dueDate?.slice(0, 10) || "")) changes.dueDate = endDate;
    if (priority !== editingTask.priority) changes.priority = priority;
    if (assigneeId !== (editingTask.assignee?.id || null)) changes.assigneeId = assigneeId;
    if (!Object.keys(changes).length || await onSave(changes)) setEditingTask(null);
  }

  return (
    <section className="rounded-xl border border-[var(--stroke)] p-4" aria-label="Manage task">
      {!editingTask && !confirmDelete ? <div className="flex flex-wrap gap-3">
        <button type="button" disabled={pending} className="secondary-button rounded-lg px-3 py-2 text-sm disabled:opacity-50" onClick={() => { setEditingTask({ ...task }); setStartDate(task.startDate?.slice(0, 10) || ""); setEndDate(task.dueDate?.slice(0, 10) || ""); }}>Edit task</button>
        <button type="button" disabled={pending} className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-600 disabled:opacity-50" onClick={() => setConfirmDelete(true)}>Delete task</button>
      </div> : null}
      {editingTask ? <form onSubmit={(event) => void submit(event)} className="workspace-task-form">
        <h3 className="field-wide text-sm font-semibold">Edit task</h3>
        {task.recurrenceId ? <p className="field-wide text-xs text-[var(--muted)]">Edits affect this task only. Future daily tasks use the original instructions and assignee. Stop daily repeat and create a new schedule to change future tasks.</p> : null}
        <label className="workspace-field field-wide">Title<input name="title" required minLength={2} maxLength={200} defaultValue={editingTask.title} disabled={pending} /></label>
        <label className="workspace-field field-wide">Description<textarea name="description" rows={3} maxLength={2000} defaultValue={editingTask.description ?? ""} disabled={pending} /></label>
        <fieldset className="field-wide grid gap-3 sm:grid-cols-2"><legend className="mb-2 text-sm font-medium">Task date range</legend>
          <label className="workspace-field">Start date<input name="startDate" type="date" required value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} disabled={pending} /></label>
          <label className="workspace-field">End date<input name="dueDate" type="date" required value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} disabled={pending} /></label>
        </fieldset>
        <label className="workspace-field">Priority<select name="priority" defaultValue={editingTask.priority} disabled={pending}><option value="LOW">Low</option><option value="MEDIUM">Normal</option><option value="HIGH">High</option></select></label>
        <label className="workspace-field field-wide">Assigned to<select name="assigneeId" defaultValue={editingTask.assignee?.id ?? ""} disabled={pending}>
          <option value="">Unassigned</option>
          {editingTask.assignee && !employees.some((employee) => employee.id === editingTask.assignee?.id) ? <option value={editingTask.assignee.id}>{editingTask.assignee.name || editingTask.assignee.email} (inactive)</option> : null}
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name || employee.email}</option>)}
        </select></label>
        <div className="workspace-dialog-actions field-wide"><button type="button" className="workspace-cancel" disabled={pending} onClick={() => setEditingTask(null)}>Cancel</button><button type="submit" className="accent-button" disabled={pending} aria-busy={pending}>{pending ? "Saving..." : "Save changes"}</button></div>
      </form> : null}
      {confirmDelete ? <div className="space-y-3" role="group" aria-label="Confirm task deletion">
        <h3 className="text-sm font-semibold">Delete &ldquo;{task.title}&rdquo;?</h3>
        <p className="text-sm text-[var(--muted)]">This permanently removes the task, checklist, comments, submissions, and reviews. This cannot be undone.</p>
        {task.recurrenceId ? <p className="text-sm text-[var(--muted)]">This deletes only this day&apos;s task. Choose Stop daily repeat first to prevent future tasks.</p> : null}
        <div className="flex flex-wrap gap-3"><button type="button" disabled={pending} className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-50" aria-busy={pending} onClick={() => void onDelete()}>{pending ? "Deleting..." : "Delete permanently"}</button><button type="button" disabled={pending} className="secondary-button rounded-lg px-3 py-2 text-sm" onClick={() => setConfirmDelete(false)}>Keep task</button></div>
      </div> : null}
    </section>
  );
}
