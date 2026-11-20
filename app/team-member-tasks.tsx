"use client";

import { useState } from "react";
import TaskChecklistProgress from "@/app/task-checklist-progress";
import TaskSubmissionHistory from "@/app/task-submission-history";
import { companyScheduleOverlaps, companyTaskSchedule, employeeDayKey, formatCompanyTaskSchedule, isCompanyTaskOverdue } from "@/lib/company-workdays";
import { taskDateKey } from "@/lib/task-dates";

type MemberTask = {
  id: string; title: string; description: string | null; status: string; priority: string;
  startDate: string | null; dueDate: string | null; assigneeId: string | null; createdAt: string; updatedAt: string;
  recurrenceId?: string | null; recurrenceDate?: string | null;
  assignedBy: { name: string | null; email: string } | null;
  checklistItems: { id: string; title: string; isCompleted: boolean }[];
  comments: { id: string; content: string; createdAt: string; user: { name: string | null; email: string } }[];
};
const statuses: Record<string, string> = { TODO: "Not started", ACCEPTED: "Accepted", IN_PROGRESS: "In progress", ON_HOLD: "On hold", SUBMITTED_FOR_REVIEW: "Awaiting review", REVISION_REQUESTED: "Revision requested", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled", DONE: "Completed" };
const priorities: Record<string, string> = { HIGH: "High", MEDIUM: "Normal", LOW: "Low" };

export default function TeamMemberTasks({ tasks, leaveDays }: { tasks: MemberTask[]; leaveDays: readonly string[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const today = employeeDayKey();
  const invalidRange = Boolean(from && to && from > to);
  const scheduled = tasks.map(task => ({ ...task, schedule: companyTaskSchedule(task, leaveDays), overdue: isCompanyTaskOverdue(task, today, task.assigneeId ? { [task.assigneeId]: leaveDays } : {}) }));
  const visible = scheduled.filter(task => !invalidRange
    && (!query.trim() || [task.title, task.description].some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    && (!status || task.status === status) && (!priority || task.priority === priority) && (!overdueOnly || task.overdue)
    && (!from && !to || companyScheduleOverlaps(task.schedule, from || "0001-01-01", to || "9999-12-31", leaveDays)));
  const pageCount = Math.max(1, Math.ceil(visible.length / 10));
  const currentPage = Math.min(page, pageCount);
  const selected = scheduled.find(task => task.id === selectedId);
  return <section className="workspace-surface" aria-labelledby="member-tasks-heading">
    <h2 id="member-tasks-heading">Assigned tasks</h2>
    <p className="mt-1 text-xs text-[var(--muted)]">All assigned company work, including completed tasks and each repeating task&apos;s daily entries. Select a task to view its details below.</p>
    <div className="my-4 flex flex-wrap items-end gap-3">
      <label className="workspace-field">Search tasks<input type="search" className="soft-input" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Title or description" /></label>
      <label className="workspace-field">Status<select className="soft-input" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="workspace-field">Priority<select className="soft-input" value={priority} onChange={event => { setPriority(event.target.value); setPage(1); }}><option value="">All priorities</option>{Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="workspace-field">Work from<input type="date" value={from} max={to || undefined} aria-invalid={invalidRange} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label>
      <label className="workspace-field">Work to<input type="date" value={to} min={from || undefined} aria-invalid={invalidRange} onChange={event => { setTo(event.target.value); setPage(1); }} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={overdueOnly} onChange={event => { setOverdueOnly(event.target.checked); setPage(1); }} />Overdue only</label>
      <button type="button" className="secondary-button px-3 py-2 text-sm" onClick={() => { setQuery(""); setStatus(""); setPriority(""); setFrom(""); setTo(""); setOverdueOnly(false); setPage(1); }}>Clear filters</button>
    </div>
    {invalidRange ? <p role="alert" className="workspace-form-error">The end date must be on or after the start date.</p> : null}
    <p role="status" className="mb-3 text-xs text-[var(--muted)]">{visible.length} of {tasks.length} task entries</p>
    {!visible.length ? <p className="py-5 text-sm text-[var(--muted)]">{tasks.length ? "No tasks match these filters." : "No company tasks assigned yet."}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Assigned tasks, including daily work history</caption><thead><tr className="border-b border-[var(--stroke)] text-xs text-[var(--muted)]"><th scope="col" className="p-3">Task</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Priority</th><th scope="col" className="p-3">Schedule</th><th scope="col" className="p-3">Checklist</th></tr></thead><tbody>{visible.slice((currentPage - 1) * 10, currentPage * 10).map(task => <tr key={task.id} className="border-b border-[var(--stroke)]"><th scope="row" className="min-w-48 p-3"><button type="button" className="text-left font-medium text-[var(--accent)] hover:underline" aria-expanded={selectedId === task.id} aria-controls="member-task-details" onClick={() => setSelectedId(selectedId === task.id ? null : task.id)}>{task.title}</button>{task.recurrenceId ? <p className="mt-1 text-xs font-normal text-[var(--muted)]">Daily work: {taskDateKey(task.recurrenceDate ?? task.dueDate) ?? "Not scheduled"}</p> : null}</th><td className="p-3">{statuses[task.status] ?? task.status}{task.overdue ? <span className="mt-1 block text-xs text-rose-500">Overdue</span> : null}</td><td className="p-3">{priorities[task.priority]}</td><td className="min-w-44 p-3 text-xs">{formatCompanyTaskSchedule(task.schedule)}</td><td className="min-w-36 p-3"><TaskChecklistProgress title={task.title} items={task.checklistItems} /></td></tr>)}</tbody></table></div>}
    {pageCount > 1 ? <div className="mt-4 flex items-center justify-between gap-3"><button type="button" className="secondary-button px-3 py-2 text-sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><p className="text-xs text-[var(--muted)]">Page {currentPage} of {pageCount}</p><button type="button" className="secondary-button px-3 py-2 text-sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div> : null}
    {selected ? <div id="member-task-details" className="mt-5 space-y-4 rounded-xl border border-[var(--stroke)] p-4" aria-label="Selected task details">
      <div className="flex items-start justify-between gap-3"><h3 className="text-base font-semibold">{selected.title}</h3><button type="button" className="secondary-button px-3 py-2 text-xs" onClick={() => setSelectedId(null)}>Close details</button></div>
      <p className="text-sm text-[var(--muted)]">{statuses[selected.status]} / {priorities[selected.priority]} priority / {formatCompanyTaskSchedule(selected.schedule)}</p>
      <p className="text-xs text-[var(--muted)]">Assigned by: {selected.assignedBy?.name || selected.assignedBy?.email || "Not recorded"}</p>
      <p className="text-xs text-[var(--muted)]">Created {new Date(selected.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} / Updated {new Date(selected.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (India time)</p>
      <p className="whitespace-pre-wrap text-sm">{selected.description || "No additional instructions."}</p>
      {selected.checklistItems.length ? <div><h4 className="mb-2 text-sm font-semibold">Checklist</h4><ul className="space-y-2">{selected.checklistItems.map(item => <li key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.isCompleted} disabled aria-label={item.title} /><span className={item.isCompleted ? "line-through text-[var(--muted)]" : ""}>{item.title}</span></li>)}</ul></div> : null}
      <TaskSubmissionHistory key={selected.id} taskId={selected.id} updatedAt={selected.updatedAt} />
      <div><h4 className="mb-2 text-sm font-semibold">Recent updates</h4>{selected.comments.length ? selected.comments.map(comment => <article key={comment.id} className="mb-2 rounded-lg border border-[var(--stroke)] p-3"><p className="whitespace-pre-wrap text-sm">{comment.content}</p><p className="mt-2 text-xs text-[var(--muted)]">{comment.user.name || comment.user.email} - {new Date(comment.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p></article>) : <p className="text-sm text-[var(--muted)]">No updates yet.</p>}</div>
    </div> : null}
  </section>;
}
