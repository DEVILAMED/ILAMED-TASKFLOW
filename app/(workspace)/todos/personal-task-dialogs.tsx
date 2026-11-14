"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { employeeDayKey } from "@/lib/employee-dashboard";
import { repeatLabels, type PersonalList, type PersonalTask } from "@/lib/personal-tasks";

export type TaskChanges = Record<string, unknown>;

export function PersonalDialog({ title, drawer = false, onClose, children }: { title: string; drawer?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} className={drawer ? "personal-task-drawer" : "workspace-task-dialog"}>
    <div className="workspace-dialog-heading"><div>{drawer ? <p className="personal-eyebrow">Personal task details</p> : null}<h2 id={titleId}>{title}</h2></div><button type="button" aria-label="Close dialog" onClick={() => ref.current?.close()}><X size={20}/></button></div>
    {children}
  </dialog>;
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function PersonalTaskForm({ task, lists, defaultListId, defaultDueDate = "", important = false, myDay = false, pending, onSave, onCancel }: {
  task?: PersonalTask; lists: PersonalList[]; defaultListId?: string; defaultDueDate?: string; important?: boolean; myDay?: boolean; pending: boolean;
  onSave: (changes: TaskChanges) => Promise<boolean>; onCancel?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const due = String(data.get("dueDate") || "");
    const reminder = String(data.get("reminderAt") || "");
    setSubmitting(true);
    try {
      await onSave({ title: String(data.get("title") || "").trim(), note: String(data.get("note") || "").trim() || null,
        listId: data.get("listId"), dueDate: due ? `${due}T00:00:00.000Z` : null,
        reminderAt: reminder ? new Date(reminder).toISOString() : null, repeat: data.get("repeat") || null,
        important: data.has("important"), myDayDate: data.has("myDay") ? `${employeeDayKey()}T00:00:00.000Z` : null,
      });
    } finally { setSubmitting(false); }
  }
  return <form className="workspace-task-form personal-task-form" onSubmit={event => void submit(event)}>
    <label className="workspace-field field-wide">Task title<input name="title" defaultValue={task?.title ?? ""} required maxLength={200} autoFocus={!task} placeholder="What needs to get done?"/></label>
    <label className="workspace-field field-wide">Notes<textarea name="note" rows={3} defaultValue={task?.note ?? ""} placeholder="Add details or useful context"/></label>
    <label className="workspace-field">List<select name="listId" defaultValue={task?.listId ?? defaultListId ?? lists.find(list => list.isInbox)?.id}>{lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
    <label className="workspace-field">Due date<input name="dueDate" type="date" defaultValue={task?.dueDate?.slice(0, 10) ?? defaultDueDate}/></label>
    <label className="workspace-field">Reminder<input name="reminderAt" type="datetime-local" defaultValue={localDateTime(task?.reminderAt ?? null)}/></label>
    <label className="workspace-field">Repeat<select name="repeat" defaultValue={task?.repeat ?? ""}><option value="">Does not repeat</option>{Object.entries(repeatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <div className="personal-check-options field-wide"><label><input type="checkbox" name="important" defaultChecked={task?.important ?? important}/> Mark as important</label><label><input type="checkbox" name="myDay" defaultChecked={task ? task.myDayDate?.slice(0, 10) === employeeDayKey() : myDay}/> Add to My Day</label></div>
    <div className="workspace-dialog-actions field-wide">{onCancel ? <button type="button" className="workspace-cancel" onClick={onCancel}>Cancel</button> : null}<button type="submit" className="accent-button" disabled={pending || submitting}>{pending || submitting ? "Saving…" : task ? "Save details" : "Create task"}</button></div>
  </form>;
}

export function PersonalTaskDrawer({ task, lists, pending, error, onClose, onUpdate, onDelete, onStep }: {
  task: PersonalTask; lists: PersonalList[]; pending: boolean; error: string | null; onClose: () => void;
  onUpdate: (changes: TaskChanges) => Promise<boolean>; onDelete: () => Promise<boolean>;
  onStep: (method: "POST" | "PATCH" | "DELETE", stepId?: string, changes?: TaskChanges) => Promise<boolean>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stepTitle, setStepTitle] = useState("");
  const completed = task.steps.filter(step => step.isCompleted).length;
  return <PersonalDialog title={task.title} drawer onClose={onClose}>
    <div className="personal-drawer-content">
      {error ? <p role="alert" className="workspace-form-error">{error}</p> : null}
      <div className="personal-detail-status"><span className={`employee-task-status status-${task.isCompleted ? "done" : "todo"}`}>{task.isCompleted ? "Completed" : "Not completed"}</span><button type="button" className="secondary-button workspace-standard-button" disabled={pending} onClick={() => void onUpdate({ isCompleted: !task.isCompleted })}><Check size={15}/>{task.isCompleted ? "Reopen task" : "Mark complete"}</button></div>
      <PersonalTaskForm key={`${task.id}:${task.updatedAt}`} task={task} lists={lists} pending={pending} onSave={onUpdate}/>
      <section className="personal-checklist"><div className="employee-panel-heading"><h3>Checklist</h3><span>{completed}/{task.steps.length} complete</span></div>
        {task.steps.length ? <div className="personal-checklist-progress" role="progressbar" aria-label="Checklist completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(completed / task.steps.length * 100)}><span style={{ width: `${completed / task.steps.length * 100}%` }}/></div> : null}
        {task.steps.map(step => <div className="personal-step" key={step.id}><input type="checkbox" aria-label={`Complete ${step.title}`} checked={step.isCompleted} disabled={pending} onChange={event => void onStep("PATCH", step.id, { isCompleted: event.target.checked })}/><input aria-label={`Step title: ${step.title}`} className={step.isCompleted ? "is-completed" : ""} defaultValue={step.title} maxLength={200} disabled={pending} onBlur={event => { const title = event.target.value.trim(); if (!title) event.target.value = step.title; else if (title !== step.title) void onStep("PATCH", step.id, { title }); }}/><button type="button" aria-label={`Remove step ${step.title}`} disabled={pending} onClick={() => void onStep("DELETE", step.id)}><X size={15}/></button></div>)}
        <form className="personal-add-step" onSubmit={event => { event.preventDefault(); if (stepTitle.trim()) void onStep("POST", undefined, { title: stepTitle.trim() }).then(ok => { if (ok) setStepTitle(""); }); }}><input className="soft-input" aria-label="New checklist step" placeholder="Add a step" maxLength={200} value={stepTitle} onChange={event => setStepTitle(event.target.value)}/><button type="submit" className="secondary-button" disabled={pending || !stepTitle.trim()} aria-label="Add checklist step"><Plus size={17}/></button></form>
      </section>
      {task.repeat ? <p className="personal-muted">Repeats {repeatLabels[task.repeat].toLowerCase()}. Completing this task creates the next occurrence.</p> : null}
      <div className="personal-danger-zone">{confirmDelete ? <><p>Delete this task and its checklist?</p><div><button type="button" className="personal-delete-button" disabled={pending} onClick={() => void onDelete()}>Delete task</button><button type="button" className="secondary-button" onClick={() => setConfirmDelete(false)}>Keep task</button></div></> : <button type="button" className="personal-delete-button" disabled={pending} onClick={() => setConfirmDelete(true)}><Trash2 size={14}/> Delete task</button>}</div>
    </div>
  </PersonalDialog>;
}
