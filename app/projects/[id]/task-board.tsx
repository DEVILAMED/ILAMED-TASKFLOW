"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import NewTaskForm from "./new-task-form";
import TaskCard from "./task-card";

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
type IssueType = "EPIC" | "STORY" | "TASK" | "BUG";
type ViewMode = "ALL" | "MINE" | "FOCUS" | "BACKLOG" | "CURRENT_SPRINT" | "RECENTLY_UPDATED";
type SortMode = "UPDATED" | "DUE_ASC" | "PRIORITY" | "POINTS" | "TITLE";

type TaskLabel = {
  id: string;
  name: string;
  color: string | null;
};

type TaskComment = {
  id: string;
  content: string;
  createdAt: string;
  author: string;
};

type TaskAssignee = {
  id: string;
  name: string | null;
  email: string;
} | null;

type SprintOption = {
  id: string;
  title: string;
  isActive: boolean;
};

type ProjectMember = {
  id: string;
  name: string | null;
  email: string;
  role: "OWNER" | "MEMBER";
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  issueType: IssueType;
  status: TaskStatus;
  priority: TaskPriority;
  storyPoints: number | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: TaskAssignee;
  sprint: SprintOption | null;
  labels: TaskLabel[];
  comments: TaskComment[];
};

type TaskBoardProps = {
  projectId: string;
  tasks: Task[];
  members: ProjectMember[];
  sprints: SprintOption[];
  currentUserId: string;
  canDeleteTasks: boolean;
  canManageTasks: boolean;
  requestedTaskId: string | null;
};

type NotificationType = "success" | "error" | "info";

type Notification = {
  id: string;
  message: string;
  type: NotificationType;
};

const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  EPIC: "Epic",
  STORY: "Story",
  TASK: "Task",
  BUG: "Bug",
};

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

const DUE_FILTERS = [
  { value: "ALL", label: "All due dates" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "NEXT_7_DAYS", label: "Due in 7 days" },
  { value: "NO_DUE_DATE", label: "No due date" },
] as const;

const VIEW_PRESETS = [
  { value: "ALL" as const, label: "All work" },
  { value: "MINE" as const, label: "Assigned to me" },
  { value: "BACKLOG" as const, label: "Backlog" },
  { value: "CURRENT_SPRINT" as const, label: "Current sprint" },
  { value: "FOCUS" as const, label: "Focus" },
  { value: "RECENTLY_UPDATED" as const, label: "Recently updated" },
];

const SORT_OPTIONS = [
  { value: "UPDATED" as const, label: "Recently updated" },
  { value: "DUE_ASC" as const, label: "Due date" },
  { value: "PRIORITY" as const, label: "Priority" },
  { value: "POINTS" as const, label: "Story points" },
  { value: "TITLE" as const, label: "Title" },
];

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isWithinNextDays(date: Date, days: number) {
  const now = startOfToday();
  const future = new Date(now);
  future.setDate(now.getDate() + days);
  const normalized = startOfDate(date);
  return normalized >= now && normalized <= future;
}

function normalize(text: string) {
  return text.trim().toLowerCase();
}

function getDueDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getPersonLabel(person: { name: string | null; email: string }) {
  return person.name || person.email;
}

function formatDueLabel(value: string | null) {
  const date = getDueDate(value);
  if (!date) {
    return "No due date";
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function matchesViewPreset(task: Task, viewMode: ViewMode, today: Date, recentThreshold: Date, currentUserId: string, activeSprintId: string | null) {
  const dueDate = getDueDate(task.dueDate);

  switch (viewMode) {
    case "MINE":
      return task.assignee?.id === currentUserId;
    case "BACKLOG":
      return !task.sprint;
    case "CURRENT_SPRINT":
      return activeSprintId ? task.sprint?.id === activeSprintId : false;
    case "FOCUS":
      return task.status !== "DONE" && (task.priority === "HIGH" || (dueDate !== null && startOfDate(dueDate) < today));
    case "RECENTLY_UPDATED":
      return new Date(task.updatedAt) >= recentThreshold;
    case "ALL":
    default:
      return true;
  }
}

function compareDueDates(left: string | null, right: string | null) {
  const leftDate = getDueDate(left);
  const rightDate = getDueDate(right);

  if (leftDate && rightDate) {
    return startOfDate(leftDate).getTime() - startOfDate(rightDate).getTime();
  }

  if (leftDate) {
    return -1;
  }

  if (rightDate) {
    return 1;
  }

  return 0;
}

export default function TaskBoard({
  projectId,
  tasks,
  members,
  sprints,
  currentUserId,
  canDeleteTasks,
  canManageTasks,
  requestedTaskId,
}: TaskBoardProps) {
  const notificationIdRef = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [issueTypeFilter, setIssueTypeFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [dueFilter, setDueFilter] = useState("ALL");
  const [labelFilter, setLabelFilter] = useState("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [sprintFilter, setSprintFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("UPDATED");
  const [hideDone, setHideDone] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [dismissedRequestedTaskId, setDismissedRequestedTaskId] = useState<string | null>(null);

  const deferredQuery = useDeferredValue(query);
  const projectLabels = Array.from(new Map(tasks.flatMap((task) => task.labels.map((label) => [label.id, label]))).values()).sort((left, right) => left.name.localeCompare(right.name));
  const labelOptions = projectLabels.map((label) => label.name);
  const activeSprintId = sprints.find((sprint) => sprint.isActive)?.id ?? null;
  const activeSprint = activeSprintId ? sprints.find((sprint) => sprint.id === activeSprintId) ?? null : null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));

      if (!isTyping && event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const normalizedQuery = normalize(deferredQuery);
  const today = startOfToday();
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(today.getDate() - 3);

  const filteredTasks = tasks.filter((task) => {
    if (!matchesViewPreset(task, viewMode, today, threeDaysAgo, currentUserId, activeSprintId)) {
      return false;
    }

    if (hideDone && task.status === "DONE") {
      return false;
    }

    if (issueTypeFilter !== "ALL" && task.issueType !== issueTypeFilter) {
      return false;
    }

    if (priorityFilter !== "ALL" && task.priority !== priorityFilter) {
      return false;
    }

    if (labelFilter !== "ALL" && !task.labels.some((label) => label.name === labelFilter)) {
      return false;
    }

    if (assigneeFilter === "UNASSIGNED" && task.assignee) {
      return false;
    }

    if (assigneeFilter !== "ALL" && assigneeFilter !== "UNASSIGNED" && task.assignee?.id !== assigneeFilter) {
      return false;
    }

    if (sprintFilter === "BACKLOG" && task.sprint) {
      return false;
    }

    if (sprintFilter !== "ALL" && sprintFilter !== "BACKLOG" && task.sprint?.id !== sprintFilter) {
      return false;
    }

    if (dueFilter !== "ALL") {
      const dueDate = getDueDate(task.dueDate);
      if (dueFilter === "NO_DUE_DATE") {
        return !dueDate;
      }

      if (!dueDate) {
        return false;
      }

      if (dueFilter === "OVERDUE" && startOfDate(dueDate) >= today) {
        return false;
      }

      if (dueFilter === "NEXT_7_DAYS" && !isWithinNextDays(dueDate, 7)) {
        return false;
      }
    }

    if (!normalizedQuery) {
      return true;
    }

    const inTitle = task.title.toLowerCase().includes(normalizedQuery);
    const inDescription = (task.description || "").toLowerCase().includes(normalizedQuery);
    const inLabels = task.labels.some((label) => label.name.toLowerCase().includes(normalizedQuery));
    const inAssignee = task.assignee ? getPersonLabel(task.assignee).toLowerCase().includes(normalizedQuery) || task.assignee.email.toLowerCase().includes(normalizedQuery) : false;
    const inSprint = task.sprint ? task.sprint.title.toLowerCase().includes(normalizedQuery) : "backlog".includes(normalizedQuery);

    return inTitle || inDescription || inLabels || inAssignee || inSprint;
  });

  const sortedTasks = [...filteredTasks].sort((left, right) => {
    if (sortMode === "TITLE") {
      return left.title.localeCompare(right.title);
    }

    if (sortMode === "DUE_ASC") {
      const dueDifference = compareDueDates(left.dueDate, right.dueDate);
      return dueDifference !== 0 ? dueDifference : new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }

    if (sortMode === "PRIORITY") {
      const priorityDifference = PRIORITY_WEIGHT[left.priority] - PRIORITY_WEIGHT[right.priority];
      if (priorityDifference !== 0) {
        return priorityDifference;
      }
      const dueDifference = compareDueDates(left.dueDate, right.dueDate);
      return dueDifference !== 0 ? dueDifference : new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }

    if (sortMode === "POINTS") {
      const pointsDifference = (right.storyPoints ?? 0) - (left.storyPoints ?? 0);
      return pointsDifference !== 0 ? pointsDifference : new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((task) => task.status === "DONE").length;
  const progress = totalTasks ? (doneTasks / totalTasks) * 100 : 0;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const completedThisWeek = tasks.filter((task) => task.status === "DONE" && new Date(task.updatedAt) >= weekAgo).length;
  const backlogTasks = tasks.filter((task) => !task.sprint).length;
  const currentSprintPoints = activeSprintId ? tasks.filter((task) => task.sprint?.id === activeSprintId).reduce((sum, task) => sum + (task.storyPoints ?? 0), 0) : 0;
  const modalTaskId = selectedTaskId
    ?? (requestedTaskId !== dismissedRequestedTaskId ? requestedTaskId : null);
  const selectedTask = tasks.find((task) => task.id === modalTaskId) ?? null;
  const closeTaskDetails = () => {
    setSelectedTaskId(null);
    setDismissedRequestedTaskId(requestedTaskId);
  };

  useEffect(() => {
    if (!modalTaskId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedTaskId(null);
        setDismissedRequestedTaskId(requestedTaskId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalTaskId, requestedTaskId]);

  const viewCounts = {
    ALL: tasks.length,
    MINE: tasks.filter((task) => task.assignee?.id === currentUserId).length,
    BACKLOG: tasks.filter((task) => !task.sprint).length,
    CURRENT_SPRINT: activeSprintId ? tasks.filter((task) => task.sprint?.id === activeSprintId).length : 0,
    FOCUS: tasks.filter((task) => matchesViewPreset(task, "FOCUS", today, threeDaysAgo, currentUserId, activeSprintId)).length,
    RECENTLY_UPDATED: tasks.filter((task) => matchesViewPreset(task, "RECENTLY_UPDATED", today, threeDaysAgo, currentUserId, activeSprintId)).length,
  };

  const pushNotification = (message: string, type: NotificationType = "info") => {
    notificationIdRef.current += 1;
    const id = `notification-${notificationIdRef.current}`;
    setNotifications((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  };

  const handleClearFilters = () => {
    setQuery("");
    setIssueTypeFilter("ALL");
    setPriorityFilter("ALL");
    setDueFilter("ALL");
    setLabelFilter("ALL");
    setAssigneeFilter("ALL");
    setSprintFilter("ALL");
    setViewMode("ALL");
    setSortMode("UPDATED");
    setHideDone(false);
  };

  return (
    <section className="flex flex-col gap-6">
      {canManageTasks ? (
        <NewTaskForm projectId={projectId} members={members} sprints={sprints} onNotify={pushNotification} />
      ) : (
        <p className="panel-card-soft rounded-[24px] px-5 py-4 text-sm text-white/48">
          Update the status of issues assigned to you. Contact your team manager to create or assign work.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="panel-card-soft rounded-[28px] p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/28">Issues completed</p><p className="mt-3 text-3xl font-semibold text-white/92">{completedThisWeek}</p><p className="mt-2 text-sm text-white/38">This week</p></div>
        <div className="panel-card-soft rounded-[28px] p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/28">Project progress</p><p className="mt-3 text-3xl font-semibold text-white/92">{formatPercent(progress)}</p><div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[linear-gradient(135deg,rgba(62,214,177,1),rgba(127,211,247,0.82))]" style={{ width: `${Math.min(progress, 100)}%` }} /></div></div>
        <div className="panel-card-soft rounded-[28px] p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/28">Backlog items</p><p className="mt-3 text-3xl font-semibold text-white/92">{backlogTasks}</p><p className="mt-2 text-sm text-white/38">Issues not assigned to a sprint</p></div>
        <div className="panel-card-soft rounded-[28px] p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/28">Active sprint points</p><p className="mt-3 text-3xl font-semibold text-white/92">{currentSprintPoints}</p><p className="mt-2 text-sm text-white/38">{activeSprint ? activeSprint.title : "No active sprint"}</p></div>
      </div>

      <div className="panel-card rounded-[32px] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/30">Board control</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {VIEW_PRESETS.map((view) => (
                <button key={view.value} type="button" onClick={() => setViewMode(view.value)} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${viewMode === view.value ? "border-[var(--accent)]/25 bg-[rgba(62,214,177,0.12)] text-[var(--accent)]" : "border-white/10 bg-white/5 text-white/48 hover:text-white/78"}`}>
                  {view.label} <span className="ml-2 text-[10px] opacity-80">{viewCounts[view.value]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/32">
              Sort
              <select className="soft-input h-10 rounded-2xl px-3 text-sm normal-case tracking-normal" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52 xl:col-span-2">Search issues
            <input ref={searchRef} className="soft-input h-11 rounded-2xl px-4 text-sm" placeholder="Press / to search title, notes, labels, assignee, sprint" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">Type<select className="soft-input h-11 rounded-2xl px-3 text-sm" value={issueTypeFilter} onChange={(event) => setIssueTypeFilter(event.target.value)}><option value="ALL">All issue types</option>{Object.entries(ISSUE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">Priority<select className="soft-input h-11 rounded-2xl px-3 text-sm" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="ALL">All priorities</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label>
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">Assignee<select className="soft-input h-11 rounded-2xl px-3 text-sm" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="ALL">Everyone</option><option value="UNASSIGNED">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{getPersonLabel(member)}</option>)}</select></label>
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">Sprint<select className="soft-input h-11 rounded-2xl px-3 text-sm" value={sprintFilter} onChange={(event) => setSprintFilter(event.target.value)}><option value="ALL">All sprints</option><option value="BACKLOG">Backlog</option>{sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.isActive ? `[Active] ${sprint.title}` : sprint.title}</option>)}</select></label>
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">Due date<select className="soft-input h-11 rounded-2xl px-3 text-sm" value={dueFilter} onChange={(event) => setDueFilter(event.target.value)}>{DUE_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select></label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">Label<select className="soft-input h-11 rounded-2xl px-3 text-sm" value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}><option value="ALL">All labels</option>{labelOptions.map((label) => <option key={label} value={label}>{label}</option>)}</select></label>
          <div className="flex items-end justify-between gap-3 text-xs text-white/32 md:justify-end">
            <span>Showing {filteredTasks.length} of {tasks.length} issues</span>
            <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/36"><input className="h-4 w-4 rounded border-white/20 bg-white/5" type="checkbox" checked={hideDone} onChange={(event) => setHideDone(event.target.checked)} />Hide done</label>
            <button className="secondary-button flex h-10 items-center px-4 text-[11px] font-semibold uppercase tracking-[0.16em]" type="button" onClick={handleClearFilters}>Clear filters</button>
          </div>
        </div>
      </div>

      <div id="board" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Issues</h2>
            <p className="mt-1 text-xs text-slate-500">Select an issue to view details, labels, and comments.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{filteredTasks.length} shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3">Issue</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Assignee</th>
                <th scope="col" className="px-4 py-3">Priority</th>
                <th scope="col" className="px-4 py-3">Due date</th>
                <th scope="col" className="px-4 py-3">Sprint</th>
                <th scope="col" className="px-5 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedTasks.length ? sortedTasks.map((task) => (
                <tr
                  id={`task-${task.id}`}
                  key={task.id}
                  className="group cursor-pointer transition hover:bg-indigo-50/50"
                  role="button"
                  onClick={() => setSelectedTaskId(task.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedTaskId(task.id);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`View details for ${task.title}`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="shrink-0 rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">{ISSUE_TYPE_LABELS[task.issueType]}</span>
                      <span className="truncate text-sm font-medium text-slate-800">{task.title}</span>
                      {task.comments.length ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{task.comments.length} comments</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${task.status === "DONE" ? "bg-emerald-50 text-emerald-700" : task.status === "IN_PROGRESS" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                      {task.status === "IN_PROGRESS" ? "In progress" : task.status === "DONE" ? "Done" : "To do"}
                    </span>
                  </td>
                  <td className="max-w-40 truncate px-4 py-3.5 text-sm text-slate-600">{task.assignee ? getPersonLabel(task.assignee) : "Unassigned"}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-600">{task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-slate-600">{formatDueLabel(task.dueDate)}</td>
                  <td className="max-w-36 truncate px-4 py-3.5 text-sm text-slate-600">{task.sprint?.title ?? "Backlog"}</td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-xs font-semibold text-indigo-700 group-hover:text-indigo-900">View</span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm text-slate-500">No issues match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTask ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeTaskDetails();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-details-title"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl shadow-slate-950/20"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <h2 id="task-details-title" className="text-base font-semibold text-slate-900">Issue details</h2>
              </div>
              <button
                type="button"
                onClick={closeTaskDetails}
                aria-label="Close issue details"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              >
                ×
              </button>
            </header>
            <div className="overflow-y-auto p-4 sm:p-5">
              <TaskCard
                task={selectedTask}
                members={members}
                sprints={sprints}
                currentUserId={currentUserId}
                canDelete={canDeleteTasks}
                canManageTasks={canManageTasks}
                projectLabels={projectLabels}
                onNotify={pushNotification}
              />
            </div>
          </section>
        </div>
      ) : null}

      {notifications.length ? (
        <div className="fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col gap-3">
          {notifications.map((note) => (
            <div key={note.id} className={`rounded-[22px] border px-4 py-3 text-sm shadow-lg ${note.type === "success" ? "feedback-success" : note.type === "error" ? "feedback-error" : "border-white/[0.08] bg-[#10202a] text-white/80"}`}>
              {note.message}
            </div>
          ))}
        </div>
      ) : null}

    </section>
  );
}