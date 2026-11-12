"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

type TaskStatus = "TODO" | "ACCEPTED" | "IN_PROGRESS" | "ON_HOLD" | "SUBMITTED_FOR_REVIEW" | "REVISION_REQUESTED" | "APPROVED" | "REJECTED" | "CANCELLED" | "DONE";
type TaskAction = TaskStatus | "REPORT_BLOCKER";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
type TaskView = "list" | "board" | "calendar";
type Employee = { id: string; name: string | null; email: string };
type ChecklistItem = { id: string; title: string; isCompleted: boolean; position: number };
type TaskComment = { id: string; content: string; createdAt: string; author: string; authorId: string };
type CompanyTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: Employee | null;
  checklistItems: ChecklistItem[];
};

const statusLabels: Record<TaskStatus, string> = {
  TODO: "Not started",
  ACCEPTED: "Accepted",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  SUBMITTED_FOR_REVIEW: "Awaiting review",
  REVISION_REQUESTED: "Revision requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  DONE: "Completed",
};
const statusProgress: Record<TaskStatus, number> = {
  TODO: 0, ACCEPTED: 10, IN_PROGRESS: 50, ON_HOLD: 50, SUBMITTED_FOR_REVIEW: 90,
  REVISION_REQUESTED: 60, APPROVED: 100, REJECTED: 0, CANCELLED: 0, DONE: 100,
};
const priorityLabels: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Normal",
  HIGH: "High",
};

function getTaskProgress(task: CompanyTask) {
  if (!task.checklistItems.length) {
    return {
      percentage: statusProgress[task.status],
      valueText: statusLabels[task.status],
      countText: null,
    };
  }

  const completed = task.checklistItems.filter((item) => item.isCompleted).length;
  const percentage = Math.round((completed / task.checklistItems.length) * 100);
  return {
    percentage,
    valueText: `${completed} of ${task.checklistItems.length} steps complete`,
    countText: `${completed}/${task.checklistItems.length} steps`,
  };
}

function employeeLabel(employee: Employee | null) {
  return employee ? employee.name || employee.email : "Unassigned";
}

function formatDueDate(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "No due date";
}

export default function CompanyTaskBoard({
  isAdmin,
  employees,
  initialTasks,
  initialFeedback = [],
}: {
  isAdmin: boolean;
  employees: Employee[];
  initialTasks: CompanyTask[];
  initialFeedback?: { id: string; taskId: string; feedback: string; reviewer: string; rating: number | null }[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [focus, setFocus] = useState("ACTIVE");
  const [tasks, setTasks] = useState(initialTasks);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [dueFilter, setDueFilter] = useState("ALL");
  const [view, setView] = useState<TaskView>("list");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [checklistText, setChecklistText] = useState("");
  const [assigneeId, setAssigneeId] = useState(employees[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, TaskComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = useMemo(() => ({
    open: tasks.filter((task) => task.status === "TODO" || task.status === "ACCEPTED").length,
    inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
    completed: tasks.filter((task) => task.status === "DONE" || task.status === "APPROVED").length,
  }), [tasks]);

  const currentDate = new Date();
  const today = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;
  const activeTask = tasks.find((task) => task.id === expandedTaskId);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !expandedTaskId) return;
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = previous; };
  }, [expandedTaskId]);
  function matchesFocus(task: CompanyTask, value: string) {
    const closed = ["APPROVED", "DONE", "REJECTED", "CANCELLED"].includes(task.status);
    if (value === "ACTIVE") return !closed;
    if (value === "CLOSED") return closed;
    if (value === "TODAY") return !closed && task.dueDate?.slice(0, 10) === today;
    if (value === "OVERDUE") return !closed && !!task.dueDate && task.dueDate.slice(0, 10) < today;
    if (value === "REVISION") return task.status === "REVISION_REQUESTED";
    return true;
  }
  const visibleTasks = tasks.filter((task) => {
    const query = search.trim().toLocaleLowerCase();
    const matchesSearch = !query
      || task.title.toLocaleLowerCase().includes(query)
      || task.description?.toLocaleLowerCase().includes(query);
    const overdue = task.status !== "DONE" && task.status !== "APPROVED" && task.status !== "CANCELLED" && task.dueDate !== null && task.dueDate.slice(0, 10) < today;
    return (isAdmin || matchesFocus(task, focus)) && matchesSearch
      && (statusFilter === "ALL" || task.status === statusFilter)
      && (employeeFilter === "ALL" || task.assignee?.id === employeeFilter)
      && (priorityFilter === "ALL" || task.priority === priorityFilter)
      && (dueFilter === "ALL" || (dueFilter === "OVERDUE" ? overdue : Boolean(task.dueDate)));
  });

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingTask(true);
    setError(null);
    setNotice(null);
    const checklistItems = checklistText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    try {
      const response = await fetch("/api/company-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, assigneeId, dueDate: dueDate || null, priority, checklistItems }),
      });
      const data = await response.json() as { ok?: boolean; task?: CompanyTask; error?: string };
      if (!response.ok || !data.ok || !data.task) {
        setError(data.error || "Unable to assign this task.");
        return;
      }
      setTasks((current) => [data.task!, ...current]);
      setTitle("");
      setDescription("");
      setChecklistText("");
      setDueDate("");
      setPriority("MEDIUM");
      setNotice("Task assigned.");
    } catch {
      setError("Unable to assign this task. Check your connection and try again.");
    } finally {
      setSavingTask(false);
    }
  }

  async function updatePriority(task: CompanyTask, nextPriority: TaskPriority) {
    setPendingId(task.id);
    setError(null);
    try {
      const response = await fetch(`/api/company-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: nextPriority }),
      });
      const data = await response.json() as { ok?: boolean; task?: CompanyTask; error?: string };
      if (!response.ok || !data.ok || !data.task) {
        setError(data.error || "Unable to update task priority.");
        return;
      }
      setTasks((current) => current.map((item) => item.id === task.id ? data.task! : item));
    } catch {
      setError("Unable to update task priority. Check your connection and try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function reassignTask(task: CompanyTask, nextAssigneeId: string) {
    setPendingId(task.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/company-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: nextAssigneeId || null }),
      });
      const data = await response.json() as { ok?: boolean; task?: CompanyTask; error?: string };
      if (!response.ok || !data.ok || !data.task) {
        setError(data.error || "Unable to reassign this task.");
        return;
      }
      setTasks((current) => current.map((item) => item.id === task.id ? data.task! : item));
      setNotice(nextAssigneeId ? `Task reassigned to ${employeeLabel(data.task.assignee)}.` : "Task is now unassigned.");
    } catch {
      setError("Unable to reassign this task. Check your connection and try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function toggleComments(taskId: string) {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      return;
    }
    setExpandedTaskId(taskId);
    if (comments[taskId]) return;

    setCommentsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/company-tasks/${taskId}/comments`, { cache: "no-store" });
      const data = await response.json() as { ok?: boolean; comments?: TaskComment[]; error?: string };
      if (!response.ok || !data.ok || !data.comments) {
        setError(data.error || "Unable to load task updates.");
        return;
      }
      setComments((current) => ({ ...current, [taskId]: data.comments! }));
    } catch {
      setError("Unable to load task updates. Check your connection and try again.");
    } finally {
      setCommentsLoading(false);
    }
  }

  async function addComment(event: React.FormEvent<HTMLFormElement>, taskId: string) {
    event.preventDefault();
    setCommentSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/company-tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentDrafts[taskId] ?? "" }),
      });
      const data = await response.json() as { ok?: boolean; comment?: TaskComment; error?: string };
      if (!response.ok || !data.ok || !data.comment) {
        setError(data.error || "Unable to post this update.");
        return;
      }
      setCommentDrafts((current) => ({ ...current, [taskId]: "" }));
      setComments((current) => ({
        ...current,
        [taskId]: [...(current[taskId] ?? []), data.comment!],
      }));
      } catch {
      setError("Unable to post this update. Check your connection and try again.");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function updateStatus(task: CompanyTask, status: TaskAction, notes?: string) {
    setPendingId(task.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/company-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(status === "REPORT_BLOCKER" ? { action: status } : { status }), ...(notes ? { notes } : {}) }),
      });
      const data = await response.json() as { ok?: boolean; task?: CompanyTask; error?: string };
      if (!response.ok || !data.ok || !data.task) {
        setError(data.error || "Unable to update task status.");
        return false;
      }
      setTasks((current) => current.map((item) => item.id === task.id ? data.task! : item));
      if ((status === "ON_HOLD" || status === "REPORT_BLOCKER") && notes) setComments((current) => { const next = { ...current }; delete next[task.id]; return next; });
      setNotice(status === "REPORT_BLOCKER" ? "Blocker reported. Management has been notified; the task status and deadline are unchanged." : `Task updated: ${statusLabels[status]}.`);
      return true;
    } catch {
      setError("Unable to update task status. Check your connection and try again.");
      return false;
    } finally {
      setPendingId(null);
    }
  }

  async function updateChecklistItem(task: CompanyTask, item: ChecklistItem, isCompleted: boolean) {
    setPendingId(task.id);
    setError(null);
    try {
      const response = await fetch(`/api/company-tasks/${task.id}/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted }),
      });
      const data = await response.json() as { ok?: boolean; item?: ChecklistItem; error?: string };
      if (!response.ok || !data.ok || !data.item) {
        setError(data.error || "Unable to update checklist progress.");
        return;
      }

      setTasks((current) => current.map((currentTask) => (
        currentTask.id === task.id
          ? {
              ...currentTask,
              checklistItems: currentTask.checklistItems.map((checklistItem) => (
                checklistItem.id === data.item!.id ? data.item! : checklistItem
              )),
            }
          : currentTask
      )));
    } catch {
      setError("Unable to update checklist progress. Check your connection and try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {isAdmin ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Not started", counts.open],
              ["In progress", counts.inProgress],
              ["Completed", counts.completed],
            ].map(([label, count]) => (
              <div key={label} className="panel-card-soft rounded-2xl p-4">
                <p className="text-xs font-medium text-white/45">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-white/90">{count}</p>
              </div>
            ))}
          </div>

          <section className="panel-card rounded-3xl p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white/90">Assign a task</h2>
            <p className="mt-1 text-sm text-white/45">Create a task and assign it to one employee.</p>
            <form onSubmit={(event) => void createTask(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium text-white/55 sm:col-span-2">
                Task
                <input
                  required
                  minLength={2}
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What needs to be done?"
                  className="soft-input h-11 rounded-xl px-3 text-sm"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-white/55 sm:col-span-2">
                Details (optional)
                <textarea
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add any useful instructions"
                  rows={2}
                  className="soft-input rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-white/55 sm:col-span-2">
                Checklist (optional, one step per line)
                <textarea
                  maxLength={4200}
                  value={checklistText}
                  onChange={(event) => setChecklistText(event.target.value)}
                  placeholder={"Prepare the materials\nComplete the work\nReview and submit"}
                  rows={3}
                  className="soft-input rounded-xl px-3 py-2 text-sm"
                  aria-describedby="task-checklist-help"
                />
                <span id="task-checklist-help" className="text-[11px] font-normal text-white/35">
                  Up to 20 steps. Employees check them off as they complete the task.
                </span>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-white/55">
                Assign to
                <select
                  required
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                  disabled={!employees.length}
                  className="soft-input h-11 rounded-xl px-3 text-sm"
                >
                  {employees.length ? employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>
                  )) : <option value="">No employee accounts available</option>}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-white/55">
                Due date (optional)
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="soft-input h-11 rounded-xl px-3 text-sm"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-white/55">
                Priority
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as TaskPriority)}
                  className="soft-input h-11 rounded-xl px-3 text-sm"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Normal</option>
                  <option value="HIGH">High</option>
                </select>
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={savingTask || !employees.length}
                  className="accent-button h-10 px-4 text-sm font-semibold disabled:opacity-50"
                >
                  {savingTask ? "Assigning..." : "Assign task"}
                </button>
              </div>
            </form>
          </section>
        </>
      ) : (
        <section aria-label="Task priorities" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[["OVERDUE", "Overdue"], ["TODAY", "Due today"], ["REVISION", "Revisions requested"], ["ACTIVE", "Active work"], ["CLOSED", "Closed work"], ["ALL", "All tasks"]].map(([value, label]) => <button key={value} type="button" aria-pressed={focus === value} onClick={() => { setFocus(value); setStatusFilter("ALL"); setDueFilter("ALL"); setSearch(""); setPriorityFilter("ALL"); }} className={`panel-card rounded-2xl p-4 text-left ${focus === value ? "ring-2 ring-indigo-400" : ""}`}><span className="text-xs text-[var(--muted)]">{label}</span><span className="mt-2 block text-2xl font-semibold text-[var(--foreground)]">{tasks.filter((task) => matchesFocus(task, value)).length}</span></button>)}
        </section>
      )}

      <section className="panel-card overflow-hidden rounded-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
            <h2 className="font-semibold text-white/90">{isAdmin ? "Company tasks" : "Assigned to me"}</h2>
            <p className="mt-1 text-xs text-white/40">{visibleTasks.length} {visibleTasks.length === 1 ? "task" : "tasks"}</p>
            </div>
            <div role="group" aria-label="Task view" className="flex rounded-lg border border-[var(--stroke)] bg-[var(--panel-soft)] p-1">
              {([["list", "List"], ["board", "Board"], ["calendar", "Calendar"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setView(value)} aria-pressed={view === value} className={`rounded-md px-3 py-1.5 text-xs font-medium ${view === value ? "bg-[var(--panel)] text-[var(--accent-strong)] shadow-sm" : "text-[var(--muted)]"}`}>{label}</button>)}
            </div>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input
              type="search"
              aria-label="Search tasks"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search task title or details"
              className="soft-input h-9 rounded-lg px-3 text-xs sm:col-span-2 lg:col-span-1"
            />
            {isAdmin ? (
              <select aria-label="Filter by employee" value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs">
                <option value="ALL">All employees</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>)}
              </select>
            ) : null}
            <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs">
              <option value="ALL">All statuses</option>
              {(Object.keys(statusLabels) as TaskStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
            </select>
            <select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs">
              <option value="ALL">All priorities</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Normal</option>
              <option value="LOW">Low</option>
            </select>
            <select aria-label="Filter by due date" value={dueFilter} onChange={(event) => setDueFilter(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs">
              <option value="ALL">All due dates</option>
              <option value="OVERDUE">Overdue only</option>
              <option value="HAS_DUE_DATE">Has a due date</option>
            </select>
          </div>
        </div>

        {error ? <p role="alert" className="mx-5 mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
        {notice ? <p role="status" className="mx-5 mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</p> : null}

        {visibleTasks.length ? view === "board" ? (
          <KanbanBoard tasks={visibleTasks} isAdmin={isAdmin} pendingId={pendingId} onUpdate={updateStatus} onOpen={(task) => void toggleComments(task.id)} />
        ) : view === "calendar" ? (
          <TaskCalendar tasks={visibleTasks} onOpen={(task) => void toggleComments(task.id)} />
        ) : (
          <>
          <div className="grid gap-3 p-4 md:hidden">{visibleTasks.map((task) => <article key={task.id} className="rounded-xl border border-[var(--stroke)] p-4"><button type="button" onClick={() => void toggleComments(task.id)} className="text-left text-sm font-semibold text-[var(--accent)]">{task.title}</button><p className="my-3 text-xs text-[var(--muted)]">{statusLabels[task.status]} / {formatDueDate(task.dueDate)} / {priorityLabels[task.priority]}</p>{isAdmin ? <p className="text-xs text-[var(--muted)]">{employeeLabel(task.assignee)}</p> : <TaskActions task={task} pending={pendingId === task.id} onUpdate={updateStatus} />}</article>)}</div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left">
              <thead className="text-[11px] uppercase tracking-wider text-white/35">
                <tr>
                  <th className="px-5 py-3 font-semibold">Task</th>
                  {isAdmin ? <th className="px-4 py-3 font-semibold">Assigned to</th> : null}
                  <th className="px-4 py-3 font-semibold">Due date</th>
                  <th className="px-4 py-3 font-semibold">Priority</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {visibleTasks.map((task) => {
                  const progress = getTaskProgress(task);
                  return (
                  <Fragment key={task.id}>
                    <tr>
                      <td className="max-w-[30rem] px-5 py-4">
                        <button type="button" onClick={() => void toggleComments(task.id)} className="text-left text-sm font-semibold text-[var(--accent)] hover:underline">{task.title}</button>
                        {task.description ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-white/40">{task.description}</p> : null}
                        {task.checklistItems.length ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-[11px] font-medium text-white/45">
                              Checklist · {task.checklistItems.filter((item) => item.isCompleted).length}/{task.checklistItems.length}
                            </p>
                            <ul className="space-y-1.5">
                              {task.checklistItems.map((item) => (
                                <li key={item.id} className="flex items-start gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={item.isCompleted}
                                    disabled={isAdmin || pendingId === task.id}
                                    onChange={(event) => void updateChecklistItem(task, item, event.target.checked)}
                                    aria-label={`${item.isCompleted ? "Mark incomplete" : "Mark complete"}: ${item.title}`}
                                    className="mt-0.5 accent-indigo-400 disabled:cursor-not-allowed"
                                  />
                                  <span className={item.isCompleted ? "text-white/35 line-through" : "text-white/65"}>
                                    {item.title}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <button type="button" onClick={() => void toggleComments(task.id)} className="mt-2 text-xs font-medium text-indigo-300 hover:text-indigo-200">
                          {expandedTaskId === task.id ? "Hide updates" : "Progress updates"}
                          {comments[task.id] ? ` (${comments[task.id].length})` : ""}
                        </button>
                      </td>
                      {isAdmin ? (
                        <td className="px-4 py-4">
                          <select
                            aria-label={`Reassign ${task.title}`}
                            value={task.assignee?.id ?? ""}
                            onChange={(event) => void reassignTask(task, event.target.value)}
                            disabled={pendingId === task.id}
                            className="soft-input h-9 max-w-48 rounded-lg px-2 text-xs disabled:opacity-50"
                          >
                            <option value="">Unassigned</option>
                            {task.assignee && !employees.some((employee) => employee.id === task.assignee?.id) ? (
                              <option value={task.assignee.id}>{employeeLabel(task.assignee)} (inactive)</option>
                            ) : null}
                            {employees.map((employee) => (
                              <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-white/55">
                        {task.dueDate && task.status !== "DONE" && task.status !== "APPROVED" && task.status !== "CANCELLED" && task.dueDate.slice(0, 10) < today ? (
                          <span className="inline-flex items-center gap-2">
                            {formatDueDate(task.dueDate)}
                            <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-2 py-1 text-[10px] font-semibold text-rose-300">Overdue</span>
                          </span>
                        ) : formatDueDate(task.dueDate)}
                      </td>
                      <td className="px-4 py-4">
                        {isAdmin ? (
                          <select
                            aria-label={`Priority for ${task.title}`}
                            value={task.priority}
                            onChange={(event) => void updatePriority(task, event.target.value as TaskPriority)}
                            disabled={pendingId === task.id}
                            className="soft-input h-9 rounded-lg px-2 text-xs disabled:opacity-50"
                          >
                            {(Object.keys(priorityLabels) as TaskPriority[]).map((value) => (
                              <option key={value} value={value}>{priorityLabels[value]}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`text-xs font-medium ${task.priority === "HIGH" ? "text-rose-300" : task.priority === "LOW" ? "text-white/40" : "text-white/60"}`}>
                            {priorityLabels[task.priority]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {isAdmin ? (
                        <select
                          aria-label={`Status for ${task.title}`}
                          value={task.status}
                          onChange={(event) => void updateStatus(task, event.target.value as TaskStatus)}
                          disabled={pendingId === task.id}
                          className="soft-input h-9 rounded-lg px-2 text-xs disabled:opacity-50"
                        >
                          {(isAdmin ? Array.from(new Set([task.status, ...(["TODO", "ACCEPTED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(task.status) ? ["ON_HOLD" as TaskStatus] : task.status === "ON_HOLD" ? ["IN_PROGRESS" as TaskStatus] : []), ...(!["APPROVED", "CANCELLED"].includes(task.status) ? ["CANCELLED" as TaskStatus] : [])])) : availableEmployeeStatuses(task.status)).map((status) => (
                            <option key={status} value={status}>{statusLabels[status]}</option>
                          ))}
                        </select>
                        ) : <TaskActions task={task} pending={pendingId === task.id} onUpdate={updateStatus} />}
                        <div
                          className="mt-2 flex items-center gap-2"
                          role="progressbar"
                          aria-label={`Progress for ${task.title}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={progress.percentage}
                          aria-valuetext={progress.valueText}
                        >
                          <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              className={`h-full rounded-full transition-[width] duration-300 ${
                                progress.percentage === 100
                                  ? "bg-emerald-400"
                                  : progress.percentage > 0
                                    ? "bg-indigo-400"
                                    : "bg-white/25"
                              }`}
                              style={{ width: `${progress.percentage}%` }}
                            />
                          </div>
                          <span className="whitespace-nowrap text-right text-[10px] tabular-nums text-white/40">
                            {progress.countText ? `${progress.countText} · ` : ""}{progress.percentage}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-white/70">{tasks.length ? "No tasks match these filters." : isAdmin ? "No tasks assigned yet." : "You have no assigned tasks yet."}</p>
            {!tasks.length && isAdmin ? <p className="mt-1 text-xs text-white/40">Use the form above to assign the first one.</p> : null}
          </div>
        )}
      </section>
      {activeTask ? <dialog ref={dialogRef} aria-labelledby="task-detail-title" onClose={() => { if (!dialogRef.current?.open) setExpandedTaskId(null); }} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-xl border-l border-[var(--stroke)] bg-[var(--panel)] p-0 text-[var(--foreground)] shadow-2xl backdrop:bg-black/40">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--stroke)] p-5"><div><p className="text-xs text-[var(--muted)]">Task details</p><h2 id="task-detail-title" className="mt-1 text-xl font-semibold">{activeTask.title}</h2></div><button autoFocus type="button" onClick={() => dialogRef.current?.close()} className="secondary-button px-3 py-2">Close</button></div>
        {[activeTask].map((task) => <div key={task.id} className="space-y-5 p-5">
          <p className="text-sm text-[var(--muted)]">{statusLabels[task.status]} / {priorityLabels[task.priority]} priority / {formatDueDate(task.dueDate)}</p>
          <p className="whitespace-pre-wrap text-sm">{task.description || "No additional instructions."}</p>
          {isAdmin && task.status === "ON_HOLD" ? <button type="button" disabled={pendingId === task.id} onClick={() => void updateStatus(task, "IN_PROGRESS")} className="accent-button px-3 py-2 text-sm">Resume task</button> : null}
          {isAdmin && ["TODO", "ACCEPTED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(task.status) ? <button type="button" disabled={pendingId === task.id} onClick={() => void updateStatus(task, "ON_HOLD")} className="secondary-button px-3 py-2 text-sm">Put on hold</button> : null}
          {isAdmin ? <section className="grid gap-3"><label className="grid gap-1 text-xs">Assigned to<select className="soft-input rounded-lg p-2" value={task.assignee?.id ?? ""} disabled={pendingId === task.id} onChange={(event) => void reassignTask(task, event.target.value)}><option value="">Unassigned</option>{task.assignee && !employees.some((employee) => employee.id === task.assignee?.id) ? <option value={task.assignee.id}>{employeeLabel(task.assignee)} (inactive)</option> : null}{employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeLabel(employee)}</option>)}</select></label><label className="grid gap-1 text-xs">Priority<select className="soft-input rounded-lg p-2" value={task.priority} disabled={pendingId === task.id} onChange={(event) => void updatePriority(task, event.target.value as TaskPriority)}>{(Object.keys(priorityLabels) as TaskPriority[]).map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}</select></label>{!["APPROVED", "CANCELLED"].includes(task.status) ? <button type="button" disabled={pendingId === task.id} onClick={() => void updateStatus(task, "CANCELLED")} className="secondary-button px-3 py-2 text-xs">Cancel task</button> : null}</section> : null}
          {!isAdmin ? <TaskActions task={task} pending={pendingId === task.id} onUpdate={updateStatus} /> : null}
          {notice ? <p role="status" className="text-sm text-emerald-600">{notice}</p> : null}
          {error ? <p role="alert" className="text-sm text-rose-500">{error}</p> : null}
          {initialFeedback.filter((review) => review.taskId === task.id).length ? <section><h3 className="mb-2 text-sm font-semibold">Review feedback</h3>{initialFeedback.filter((review) => review.taskId === task.id).map((review) => <article key={review.id} className="mb-2 rounded-xl border border-[var(--stroke)] p-3"><p className="whitespace-pre-wrap text-sm">{review.feedback}</p><p className="mt-2 text-xs text-[var(--muted)]">{review.reviewer}{review.rating ? ` / ${review.rating}/5` : ""}</p></article>)}</section> : null}
          {task.checklistItems.length ? <section><h3 className="mb-2 text-sm font-semibold">Checklist</h3>{task.checklistItems.map((item) => <label key={item.id} className="flex items-start gap-3 py-2 text-sm"><input type="checkbox" checked={item.isCompleted} disabled={isAdmin || pendingId === task.id} onChange={(event) => void updateChecklistItem(task, item, event.target.checked)} /><span className={item.isCompleted ? "line-through opacity-60" : ""}>{item.title}</span></label>)}</section> : null}
                          <div className="mx-auto max-w-3xl">
                            <h3 className="text-sm font-semibold text-white/80">Progress updates</h3>
                            {commentsLoading ? <p className="mt-3 text-xs text-white/40">Loading updates...</p> : null}
                            {comments[task.id]?.length ? (
                              <div className="mt-3 grid gap-2">
                                {comments[task.id].map((comment) => (
                                  <article key={comment.id} className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
                                    <div className="flex flex-wrap justify-between gap-2">
                                      <p className="text-xs font-semibold text-white/70">{comment.author}</p>
                                      <time className="text-[10px] text-white/35">{new Date(comment.createdAt).toLocaleString()}</time>
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-white/55">{comment.content}</p>
                                  </article>
                                ))}
                              </div>
                            ) : !commentsLoading && comments[task.id] ? (
                              <p className="mt-2 text-xs text-white/40">No updates yet.</p>
                            ) : null}
                            <form onSubmit={(event) => void addComment(event, task.id)} className="mt-3 flex flex-col gap-2 sm:flex-row">
                              <textarea
                                required
                                maxLength={2000}
                                rows={2}
                                aria-label="Progress update"
                                value={commentDrafts[task.id] ?? ""}
                                onChange={(event) => setCommentDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                                placeholder={isAdmin ? "Add an update for the employee..." : "Share progress or explain what's blocking you..."}
                                className="soft-input min-h-11 flex-1 rounded-xl px-3 py-2 text-sm"
                              />
                              <button type="submit" disabled={commentSubmitting || !(commentDrafts[task.id] ?? "").trim()} className="secondary-button h-10 px-4 text-xs font-semibold disabled:opacity-50">
                                {commentSubmitting ? "Posting..." : "Post update"}
                              </button>
                            </form>
                          </div>

        </div>)}
      </dialog> : null}

    </div>
  );
}

function availableEmployeeStatuses(status: TaskStatus): TaskStatus[] {
  const transitions: Partial<Record<TaskStatus, TaskStatus[]>> = {
    TODO: ["ACCEPTED", "IN_PROGRESS"],
    ACCEPTED: ["IN_PROGRESS"],
    IN_PROGRESS: ["SUBMITTED_FOR_REVIEW"],
    ON_HOLD: [],
    REVISION_REQUESTED: ["IN_PROGRESS", "SUBMITTED_FOR_REVIEW"],
  };
  return [status, ...(transitions[status] ?? [])];
}

function KanbanBoard({ tasks, isAdmin, pendingId, onUpdate, onOpen }: {
  tasks: CompanyTask[]; onOpen: (task: CompanyTask) => void; isAdmin: boolean; pendingId: string | null; onUpdate: (task: CompanyTask, status: TaskAction, notes?: string) => Promise<boolean>;
}) {
  const columns: { title: string; status: TaskStatus; matches: TaskStatus[] }[] = [
    { title: "To do", status: "TODO", matches: ["TODO", "ACCEPTED"] },
    { title: "In progress", status: "IN_PROGRESS", matches: ["IN_PROGRESS"] },
    { title: "On hold", status: "ON_HOLD", matches: ["ON_HOLD", "REVISION_REQUESTED"] },
    { title: "In review", status: "SUBMITTED_FOR_REVIEW", matches: ["SUBMITTED_FOR_REVIEW"] },
    { title: "Completed", status: "APPROVED", matches: ["APPROVED", "DONE"] },
    { title: "Closed", status: "CANCELLED", matches: ["REJECTED", "CANCELLED"] },
  ];
  return <div className="grid gap-3 overflow-x-auto p-4 md:grid-cols-2 xl:grid-cols-6">
    {columns.map((column) => <section key={column.status} className="min-h-52 rounded-xl border border-[var(--stroke)] bg-[var(--panel-soft)] p-2.5">
      <div className="mb-2 flex items-center justify-between px-1"><h3 className="text-xs font-semibold text-[var(--foreground)]">{column.title}</h3><span className="rounded-md bg-[var(--panel)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">{tasks.filter((task) => column.matches.includes(task.status)).length}</span></div>
      <div className="grid content-start gap-2">{tasks.filter((task) => column.matches.includes(task.status)).map((task) => <article key={task.id} className="rounded-lg border border-[var(--stroke)] bg-[var(--panel)] p-3 shadow-sm">
        <button type="button" onClick={() => onOpen(task)} className="text-left text-sm font-semibold text-[var(--accent)] hover:underline">{task.title}</button>{task.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{task.description}</p> : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className={`rounded-md px-1.5 py-1 text-[10px] font-semibold ${task.priority === "HIGH" ? "bg-rose-50 text-rose-600" : task.priority === "MEDIUM" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{priorityLabels[task.priority]}</span>{task.dueDate ? <time className="text-[10px] text-[var(--muted)]">{formatDueDate(task.dueDate)}</time> : null}</div>
        {task.assignee ? <div className="mt-2 flex min-w-0 items-center gap-2"><span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-semibold text-indigo-700">{(task.assignee.name || task.assignee.email).slice(0, 1).toUpperCase()}</span><p className="truncate text-[11px] text-[var(--muted)]">{employeeLabel(task.assignee)}</p></div> : null}
        {!isAdmin ? <div className="mt-3"><TaskActions task={task} pending={pendingId === task.id} onUpdate={onUpdate} /></div> : null}
      </article>)}</div>
    </section>)}
  </div>;
}

function TaskCalendar({ tasks, onOpen }: { tasks: CompanyTask[]; onOpen: (task: CompanyTask) => void }) {
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  function key(day: number) { return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return <div className="p-4">
    <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold text-[var(--foreground)]">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3><div className="flex gap-2"><button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="secondary-button h-8 w-8">‹</button><button type="button" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); }} className="secondary-button h-8 px-3 text-xs">Today</button><button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="secondary-button h-8 w-8">›</button></div></div>
    <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-[var(--stroke)]">{weekDays.map((day) => <div key={day} className="border-b border-[var(--stroke)] bg-[var(--panel-soft)] px-2 py-2 text-center text-[10px] font-semibold text-[var(--muted)]">{day}</div>)}{cells.map((day, index) => {
      const dateTasks = day ? tasks.filter((task) => task.dueDate?.slice(0, 10) === key(day)) : [];
      return <div key={index} className={`min-h-24 border-b border-r border-[var(--stroke)] p-1.5 ${day ? "bg-[var(--panel)]" : "bg-[var(--panel-soft)]"}`}><span className="text-[10px] text-[var(--muted)]">{day ?? ""}</span><div className="mt-1 grid gap-1">{dateTasks.slice(0, 3).map((task) => <button type="button" onClick={() => onOpen(task)} key={task.id} title={task.title} className="truncate rounded bg-indigo-50 px-1.5 py-1 text-[9px] font-medium text-indigo-700">{task.title}</button>)}{dateTasks.length > 3 ? <p className="px-1 text-[9px] text-[var(--muted)]">+{dateTasks.length - 3} more</p> : null}</div></div>;
    })}</div>
    {!tasks.some((task) => task.dueDate) ? <p className="mt-4 text-center text-xs text-[var(--muted)]">No tasks have due dates in this view.</p> : null}
  </div>;
}

function TaskActions({ task, pending, onUpdate }: { task: CompanyTask; pending: boolean; onUpdate: (task: CompanyTask, status: TaskAction, notes?: string) => Promise<boolean> }) {
  const [decision, setDecision] = useState<TaskAction | null>(null);
  const [notes, setNotes] = useState("");
  const actions: Partial<Record<TaskStatus, [TaskAction, string][]>> = {
    TODO: [["IN_PROGRESS", "Start task"], ["REPORT_BLOCKER", "Report blocker"]],
    ACCEPTED: [["IN_PROGRESS", "Start task"], ["REPORT_BLOCKER", "Report blocker"]],
    IN_PROGRESS: [["SUBMITTED_FOR_REVIEW", "Submit for review"], ["REPORT_BLOCKER", "Report blocker"]],
    REVISION_REQUESTED: [["IN_PROGRESS", "Work on revision"], ["SUBMITTED_FOR_REVIEW", "Resubmit for review"], ["REPORT_BLOCKER", "Report blocker"]],
  };
  const available = actions[task.status] ?? [];
  return <div className="flex flex-wrap gap-2">
    {decision && available.some(([action]) => action === decision) ? <form className="w-full space-y-2" onSubmit={async (event) => { event.preventDefault(); if (await onUpdate(task, decision, notes.trim())) { setDecision(null); setNotes(""); } }}>
      <label className="grid gap-2 text-xs">{decision === "REPORT_BLOCKER" ? "What is blocking this task?" : "Submission notes (optional)"}
        <textarea className="soft-input w-full rounded-lg p-2 text-sm" required={decision === "REPORT_BLOCKER"} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <div className="flex gap-2"><button disabled={pending || (decision === "REPORT_BLOCKER" && !notes.trim())} type="submit" className="accent-button px-3 py-2 text-xs disabled:opacity-50">{pending ? "Saving..." : decision === "REPORT_BLOCKER" ? "Send blocker report" : "Confirm submission"}</button><button disabled={pending} type="button" onClick={() => setDecision(null)} className="secondary-button px-3 py-2 text-xs">Cancel</button></div>
    </form> : null}
    {available.map(([status, label], index) => <button key={status} type="button" disabled={pending} onClick={() => { if (status === "REPORT_BLOCKER" || status === "SUBMITTED_FOR_REVIEW") setDecision(status); else onUpdate(task, status); }} className={`${index === 0 ? "accent-button" : "secondary-button"} px-3 py-2 text-xs disabled:opacity-50`}>{pending ? "Saving..." : label}</button>)}
    {task.status === "SUBMITTED_FOR_REVIEW" ? <p className="text-xs text-[var(--muted)]">Awaiting manager review</p> : null}
    {task.status === "ON_HOLD" ? <p className="text-xs text-[var(--muted)]">On hold. Your manager or administrator must resume this task.</p> : null}
  </div>;
}
