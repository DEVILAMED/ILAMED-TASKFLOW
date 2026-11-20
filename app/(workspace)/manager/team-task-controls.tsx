"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCompanyTaskSchedule } from "@/lib/company-workdays";
import TaskChecklistProgress from "@/app/task-checklist-progress";
import UserAvatar from "@/app/user-avatar";

type TeamTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  workingDays: number | null;
  checklistItems: { isCompleted: boolean }[];
  assignee: { id: string; name: string | null; email: string; avatarUrl?: string | null } | null;
  assignedBy: { name: string | null; email: string } | null;
  comments: { id: string; content: string }[];
};

export default function TeamTaskControls({ tasks }: { tasks: TeamTask[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [employee, setEmployee] = useState("");
  const [status, setStatus] = useState("");
  const [blockersOnly, setBlockersOnly] = useState(false);
  const employees = [...new Map(tasks.flatMap(task => task.assignee ? [[task.assignee.id, task.assignee] as const] : [])).values()];
  const visibleTasks = tasks.filter(task => (!query.trim() || [task.title, task.description, task.assignee?.name, task.assignee?.email].some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    && (!employee || task.assignee?.id === employee)
    && (!status || task.status === status)
    && (!blockersOnly || task.comments.length > 0));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    function refresh() { if (!pending && document.visibilityState === "visible") router.refresh(); }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); };
  }, [router, pending]);

  async function changeStatus(task: TeamTask) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/company-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: task.status === "ON_HOLD" ? "IN_PROGRESS" : "ON_HOLD" }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to update task.");
      setNotice(`"${task.title}" ${task.status === "ON_HOLD" ? "resumed" : "put on hold"}. The employee has been notified.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <section className="panel-card rounded-2xl p-5">
    <h2 className="text-base font-semibold text-[var(--foreground)]">Manage team work</h2>
    <p className="mt-1 text-xs text-[var(--muted)]">Review blockers, approve holds, and resume work within the scheduled date range.</p>
    <div className="my-3 flex flex-wrap items-end gap-3">
      <label className="workspace-field">Search team work<input type="search" className="soft-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Task or employee" /></label>
      <label className="workspace-field">Employee<select className="soft-input" value={employee} onChange={event => setEmployee(event.target.value)}><option value="">All employees</option>{employees.map(person => <option key={person.id} value={person.id}>{person.name || person.email}</option>)}</select></label>
      <label className="workspace-field">Status<select className="soft-input" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{[...new Set(tasks.map(task => task.status))].sort().map(value => <option key={value} value={value}>{value.replaceAll("_", " ").toLowerCase()}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={blockersOnly} onChange={event => setBlockersOnly(event.target.checked)} />Reported blockers</label>
      <button type="button" className="secondary-button px-3 py-2 text-sm" onClick={() => { setQuery(""); setEmployee(""); setStatus(""); setBlockersOnly(false); }}>Clear filters</button>
    </div>
    <p role="status" className="text-xs text-[var(--muted)]">{visibleTasks.length} of {tasks.length} tasks</p>
    {tasks.length > 0 && !visibleTasks.length ? <p className="mt-3 text-sm text-[var(--muted)]">No team tasks match these filters.</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-rose-500">{error}</p> : null}
    {notice ? <p role="status" className="mt-3 text-sm text-[var(--accent)]">{notice}</p> : null}
    {!tasks.length ? <p className="mt-3 text-sm text-[var(--muted)]">No team tasks require hold or resume controls.</p> : null}
    <div className="mt-3 divide-y divide-[var(--stroke)]">{visibleTasks.map((task) => <article id={`task-${task.id}`} key={task.id} className="scroll-mt-24 py-3 target:rounded-xl target:bg-[var(--panel-soft)] target:p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-sm font-medium">{task.title}</h3><p className="user-identity mt-1 text-xs text-[var(--muted)]">{task.assignee ? <UserAvatar name={task.assignee.name || task.assignee.email} src={task.assignee.avatarUrl} size={24} /> : null}{task.assignee?.name || task.assignee?.email} / {task.status.replaceAll("_", " ").toLowerCase()}</p></div>
        {["TODO", "ACCEPTED", "IN_PROGRESS", "REVISION_REQUESTED", "ON_HOLD"].includes(task.status) ? <button type="button" disabled={pending} onClick={() => void changeStatus(task)} className={`${task.status === "ON_HOLD" ? "accent-button" : "secondary-button"} px-3 py-2 text-xs disabled:opacity-50`}>{task.status === "ON_HOLD" ? "Resume task" : "Put on hold"}</button> : null}
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">{formatCompanyTaskSchedule(task)}</p>
      <p className="mt-2 text-xs text-[var(--muted)]">Assigned by: {task.assignedBy ? task.assignedBy.name || task.assignedBy.email : "Not recorded"}</p>
      <TaskChecklistProgress title={task.title} items={task.checklistItems} className="mt-3 max-w-xs" />
      {task.description ? <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{task.description}</p> : null}
      {task.comments.map((comment) => <p key={comment.id} className="mt-2 whitespace-pre-wrap rounded-lg bg-[var(--panel-soft)] p-3 text-sm text-[var(--muted)]">{comment.content}</p>)}
    </article>)}</div>
  </section>;
}
