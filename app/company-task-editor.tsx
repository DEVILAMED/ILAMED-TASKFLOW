"use client";

import { useState, type FormEvent } from "react";
import type { CompanyTaskRepeatInfo } from "@/lib/company-task-repeat";

type Employee = { id: string; name: string | null; email: string };
type ChecklistItem = { id?: string; title: string };
type EditableTask = CompanyTaskRepeatInfo & { id: string; title: string; status: string; description: string | null; startDate: string | null; dueDate: string | null; priority: "LOW" | "MEDIUM" | "HIGH"; assignee: Employee | null; checklistItems: ChecklistItem[] };
export type CompanyTaskChanges = { title?: string; description?: string; startDate?: string | null; dueDate?: string | null; priority?: "LOW" | "MEDIUM" | "HIGH"; assigneeId?: string | null; checklistItems?: ChecklistItem[] };

export default function CompanyTaskEditor({ task, employees, pending, onSave, onDelete, allowAssignment = true, allowEditing = true }: {
  task: EditableTask;
  employees: Employee[];
  pending: boolean;
  onSave: (changes: CompanyTaskChanges) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  allowAssignment?: boolean;
  allowEditing?: boolean;
}) {
  const [editingTask, setEditingTask] = useState<EditableTask | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const canEditChecklist = ["TODO", "ACCEPTED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(task.status);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask || pending) return;
    const values = new FormData(event.currentTarget);
    const changes: CompanyTaskChanges = {};
    const title = String(values.get("title") || "").trim();
    const description = String(values.get("description") || "").trim();
    const priority = String(values.get("priority")) as EditableTask["priority"];
    const assigneeId = task.status === "SUBMITTED_FOR_REVIEW" ? editingTask.assignee?.id ?? null : String(values.get("assigneeId") || "") || null;
    if (title !== editingTask.title) changes.title = title;
    if (description !== (editingTask.description || "")) changes.description = description;
    if (startDate !== (editingTask.startDate?.slice(0, 10) || "")) changes.startDate = startDate;
    if (endDate !== (editingTask.dueDate?.slice(0, 10) || "")) changes.dueDate = endDate;
    if (priority !== editingTask.priority) changes.priority = priority;
    if (allowAssignment && assigneeId !== (editingTask.assignee?.id || null)) changes.assigneeId = assigneeId;
    const checklist = checklistItems.map(item => ({ ...item, title: item.title.trim() }));
    if (canEditChecklist && JSON.stringify(checklist) !== JSON.stringify(editingTask.checklistItems.map(({ id, title }) => ({ id, title })))) changes.checklistItems = checklist;
    if (!Object.keys(changes).length || await onSave(changes)) setEditingTask(null);
  }

  return (
    <section className="rounded-xl border border-[var(--stroke)] p-4" aria-label="Manage task">
      {!editingTask && !confirmDelete ? <div className="flex flex-wrap gap-3">
        {allowEditing ? <button type="button" disabled={pending} className="secondary-button rounded-lg px-3 py-2 text-sm disabled:opacity-50" onClick={() => { setEditingTask({ ...task }); setChecklistItems(task.checklistItems.map(({ id, title }) => ({ id, title }))); setStartDate(task.startDate?.slice(0, 10) || ""); setEndDate(task.dueDate?.slice(0, 10) || ""); }}>Edit task</button> : null}
        {onDelete ? <button type="button" disabled={pending} className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-600 disabled:opacity-50" onClick={() => setConfirmDelete(true)}>Delete task</button> : null}
      </div> : null}
      {editingTask ? <form onSubmit={(event) => void submit(event)} className="workspace-task-form">
        <h3 className="field-wide text-sm font-semibold">Edit task</h3>
        {task.recurrenceId ? <p className="field-wide text-xs text-[var(--muted)]">Edits affect this task only. Future daily tasks use the original instructions and assignee.</p> : null}
        <label className="workspace-field field-wide">Title<input name="title" required minLength={2} maxLength={200} defaultValue={editingTask.title} disabled={pending} /></label>
        <label className="workspace-field field-wide">Description<textarea name="description" rows={3} maxLength={2000} defaultValue={editingTask.description ?? ""} disabled={pending} /></label>
        <fieldset className="field-wide space-y-3" disabled={pending || !canEditChecklist}>
          <legend className="mb-2 text-sm font-medium">Checklist</legend>
          {checklistItems.map((item, index) => <div key={item.id ?? `new-${index}`} className="flex gap-2">
            <input className="soft-input min-w-0 flex-1" aria-label={`Checklist item ${index + 1}`} required maxLength={200} value={item.title} onChange={event => setChecklistItems(current => current.map((entry, position) => position === index ? { ...entry, title: event.target.value } : entry))} />
            <button type="button" className="secondary-button px-3 text-sm" aria-label={`Remove checklist item ${index + 1}`} onClick={() => setChecklistItems(current => current.filter((_, position) => position !== index))}>Remove</button>
          </div>)}
          <button type="button" className="secondary-button px-3 py-2 text-sm" disabled={checklistItems.length >= 20} onClick={() => setChecklistItems(current => [...current, { title: "" }])}>Add checklist item</button>
        </fieldset>
        {!canEditChecklist ? <p className="field-wide text-xs text-[var(--muted)]">Checklist editing is available before submission or when revisions are requested.</p> : null}
        <fieldset className="field-wide grid gap-3 sm:grid-cols-2"><legend className="mb-2 text-sm font-medium">Task date range</legend>
          <label className="workspace-field">Start date<input name="startDate" type="date" required value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} disabled={pending} /></label>
          <label className="workspace-field">End date<input name="dueDate" type="date" required value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} disabled={pending} /></label>
        </fieldset>
        <label className="workspace-field">Priority<select name="priority" defaultValue={editingTask.priority} disabled={pending}><option value="LOW">Low</option><option value="MEDIUM">Normal</option><option value="HIGH">High</option></select></label>
        {allowAssignment ? <label className="workspace-field field-wide">Assigned to<select name="assigneeId" defaultValue={editingTask.assignee?.id ?? ""} disabled={pending || task.status === "SUBMITTED_FOR_REVIEW"}>
          <option value="">Unassigned</option>
          {editingTask.assignee && !employees.some((employee) => employee.id === editingTask.assignee?.id) ? <option value={editingTask.assignee.id}>{editingTask.assignee.name || editingTask.assignee.email} (inactive)</option> : null}
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name || employee.email}</option>)}
        </select></label> : null}
        {allowAssignment && task.status === "SUBMITTED_FOR_REVIEW" ? <p className="field-wide text-xs text-[var(--muted)]">Review the pending submission or cancel the task before changing its assignee.</p> : null}
        <div className="workspace-dialog-actions field-wide"><button type="button" className="workspace-cancel" disabled={pending} onClick={() => setEditingTask(null)}>Cancel</button><button type="submit" className="accent-button" disabled={pending} aria-busy={pending}>{pending ? "Saving..." : "Save changes"}</button></div>
      </form> : null}
      {confirmDelete && onDelete ? <div className="space-y-3" role="group" aria-label="Confirm task deletion">
        <h3 className="text-sm font-semibold">Move &ldquo;{task.title}&rdquo; to the recycle bin?</h3>
        <p className="text-sm text-[var(--muted)]">The task leaves active lists. Its checklist, updates, submissions, reviews, and uploaded files are retained. An administrator can restore it from the recycle bin.</p>
        {task.recurrenceId ? <p className="text-sm text-[var(--muted)]">This moves only this day&apos;s task. Choose Stop daily repeat first to prevent future tasks.</p> : null}
        <div className="flex flex-wrap gap-3"><button type="button" disabled={pending} className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-50" aria-busy={pending} onClick={() => void onDelete()}>{pending ? "Moving…" : "Move to recycle bin"}</button><button type="button" disabled={pending} className="secondary-button rounded-lg px-3 py-2 text-sm" onClick={() => setConfirmDelete(false)}>Keep task</button></div>
      </div> : null}
    </section>
  );
}
