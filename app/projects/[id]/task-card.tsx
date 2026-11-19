"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
type IssueType = "EPIC" | "STORY" | "TASK" | "BUG";

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
} | null;

type ProjectMember = {
  id: string;
  name: string | null;
  email: string;
  role: "OWNER" | "MEMBER";
};

type NotificationType = "success" | "error" | "info";

type TaskCardProps = {
  task: {
    id: string;
    title: string;
    description: string | null;
    issueType: IssueType;
    status: TaskStatus;
    priority: TaskPriority;
    storyPoints: number | null;
    dueDate: string | null;
    assignee: TaskAssignee;
    sprint: SprintOption;
    labels: TaskLabel[];
    comments: TaskComment[];
  };
  members: ProjectMember[];
  sprints: Exclude<SprintOption, null>[];
  currentUserId: string;
  canDelete: boolean;
  canManageTasks: boolean;
  projectLabels: TaskLabel[];
  onNotify?: (message: string, type?: NotificationType) => void;
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "Todo",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  EPIC: "Epic",
  STORY: "Story",
  TASK: "Task",
  BUG: "Bug",
};

function formatDueDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCommentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getPersonLabel(person: { name: string | null; email: string }) {
  return person.name || person.email;
}

function getDueMeta(value: string | null, status: TaskStatus) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = startOfToday();
  const due = startOfDate(date);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (status !== "DONE" && diff < 0) {
    return {
      label: `${Math.abs(diff)}d overdue`,
      className: "border-red-500/20 bg-red-500/10 text-red-300",
    };
  }

  if (status !== "DONE" && diff === 0) {
    return {
      label: "Due today",
      className: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    };
  }

  if (status !== "DONE" && diff <= 3) {
    return {
      label: diff === 1 ? "Due tomorrow" : `Due in ${diff}d`,
      className: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    };
  }

  return {
    label: `Due ${formatDueDate(value)}`,
    className: "border-white/10 bg-white/5 text-white/60",
  };
}

function getNextStatus(status: TaskStatus) {
  if (status === "TODO") {
    return { value: "IN_PROGRESS" as const, label: "Start work" };
  }

  if (status === "IN_PROGRESS") {
    return { value: "DONE" as const, label: "Mark done" };
  }

  return { value: "TODO" as const, label: "Reopen" };
}

export default function TaskCard({
  task,
  members,
  sprints,
  currentUserId,
  canDelete,
  canManageTasks,
  projectLabels,
  onNotify,
}: TaskCardProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [issueType, setIssueType] = useState<IssueType>(task.issueType);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [storyPoints, setStoryPoints] = useState(task.storyPoints?.toString() ?? "");
  const [dueDate, setDueDate] = useState(() => (task.dueDate ? task.dueDate.slice(0, 10) : ""));
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id ?? "");
  const [sprintId, setSprintId] = useState(task.sprint?.id ?? "");
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("#3ed6b1");
  const [commentBody, setCommentBody] = useState("");

  const dueMeta = getDueMeta(task.dueDate, task.status);
  const nextStatus = getNextStatus(task.status);
  const latestComment = task.comments[task.comments.length - 1];
  const canAssignToSelf = canManageTasks && members.some((member) => member.id === currentUserId);
  const suggestedLabels = projectLabels.filter(
    (label) => !task.labels.some((taskLabel) => taskLabel.id === label.id),
  ).slice(0, 4);

  const refreshPage = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleUpdate = async (
    payload: Record<string, unknown>,
    successMessage = "Issue updated.",
  ) => {
    setError(null);
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      onNotify?.(successMessage, "success");
      refreshPage();
      return true;
    }

    const data = await response.json().catch(() => ({}));
    const message = data.error || "Unable to update issue.";
    setError(message);
    onNotify?.(message, "error");
    return false;
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (title.trim().length < 2) {
      setError("Task title must be at least 2 characters.");
      return;
    }

    const success = await handleUpdate(
      {
        title: title.trim(),
        description: description.trim(),
        issueType,
        status,
        priority,
        storyPoints: storyPoints || null,
        dueDate: dueDate || null,
        assigneeId: assigneeId || null,
        sprintId: sprintId || null,
      },
      "Issue updated.",
    );

    if (success) {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete ${task.title}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setError(null);
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      onNotify?.(`Deleted ${task.title}`, "success");
      refreshPage();
      return;
    }

    const data = await response.json().catch(() => ({}));
    const message = data.error || "Unable to delete issue.";
    setError(message);
    onNotify?.(message, "error");
  };

  const handleAdvance = async () => {
    await handleUpdate(
      { status: nextStatus.value },
      nextStatus.value === "DONE" ? "Issue marked done." : `Moved to ${STATUS_LABELS[nextStatus.value]}.`,
    );
  };

  const handleAssignToMe = async () => {
    await handleUpdate({ assigneeId: currentUserId }, "Assigned to you.");
  };

  const handleUnassign = async () => {
    await handleUpdate({ assigneeId: null }, "Issue unassigned.");
  };

  const handleAddLabel = async (payload: { labelId?: string; name?: string; color?: string | null }, successMessage: string) => {
    setLabelError(null);

    const response = await fetch(`/api/tasks/${task.id}/labels`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setLabelName("");
      onNotify?.(successMessage, "success");
      refreshPage();
      return;
    }

    const data = await response.json().catch(() => ({}));
    const message = data.error || "Unable to add label.";
    setLabelError(message);
    onNotify?.(message, "error");
  };

  const handleCreateLabel = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = labelName.trim();
    if (name.length < 2) {
      setLabelError("Label name must be at least 2 characters.");
      return;
    }

    await handleAddLabel({ name, color: labelColor }, `Label ${name} added.`);
  };

  const handleRemoveLabel = async (label: TaskLabel) => {
    setLabelError(null);

    const response = await fetch(`/api/tasks/${task.id}/labels`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ labelId: label.id }),
    });

    if (response.ok) {
      onNotify?.(`Removed ${label.name}.`, "success");
      refreshPage();
      return;
    }

    const data = await response.json().catch(() => ({}));
    const message = data.error || "Unable to remove label.";
    setLabelError(message);
    onNotify?.(message, "error");
  };

  const handleAddComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCommentError(null);

    const content = commentBody.trim();
    if (!content) {
      setCommentError("Comment cannot be empty.");
      return;
    }

    const response = await fetch(`/api/tasks/${task.id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    });

    if (response.ok) {
      setCommentBody("");
      onNotify?.("Comment added.", "success");
      refreshPage();
      return;
    }

    const data = await response.json().catch(() => ({}));
    const message = data.error || "Unable to add comment.";
    setCommentError(message);
    onNotify?.(message, "error");
  };

  if (isEditing) {
    return (
      <form className="panel-card-soft flex flex-col gap-4 rounded-[28px] p-5" onSubmit={handleSave}>
        <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
          Title
          <input className="soft-input h-11 rounded-2xl px-4 text-sm" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
          Description
          <textarea className="soft-input min-h-[92px] rounded-[22px] px-4 py-3 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
            Issue type
            <select className="soft-input h-11 rounded-2xl px-3 text-sm" value={issueType} onChange={(event) => setIssueType(event.target.value as IssueType)}>
              <option value="EPIC">Epic</option>
              <option value="STORY">Story</option>
              <option value="TASK">Task</option>
              <option value="BUG">Bug</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
            Status
            <select className="soft-input h-11 rounded-2xl px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
              <option value="TODO">Todo</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
            Priority
            <select className="soft-input h-11 rounded-2xl px-3 text-sm" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
            Story points
            <input className="soft-input h-11 rounded-2xl px-3 text-sm" type="number" min="1" max="100" step="1" value={storyPoints} onChange={(event) => setStoryPoints(event.target.value)} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
            Due date
            <input className="soft-input h-11 rounded-2xl px-3 text-sm" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
            Assignee
            <select className="soft-input h-11 rounded-2xl px-3 text-sm" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{getPersonLabel(member)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
            Sprint
            <select className="soft-input h-11 rounded-2xl px-3 text-sm" value={sprintId} onChange={(event) => setSprintId(event.target.value)}>
              <option value="">Backlog</option>
              {sprints.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>{sprint.isActive ? `[Active] ${sprint.title}` : sprint.title}</option>
              ))}
            </select>
          </label>
        </div>
        {error ? <p className="feedback-error rounded-2xl border px-4 py-3 text-sm">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button className="accent-button flex h-10 items-center px-5 text-xs font-semibold uppercase tracking-[0.16em] disabled:opacity-60" type="submit" disabled={isPending} aria-busy={isPending}>
            {isPending ? "Saving..." : "Save changes"}
          </button>
          <button className="secondary-button flex h-10 items-center px-5 text-xs font-semibold uppercase tracking-[0.16em]" type="button" onClick={() => { setIsEditing(false); setError(null); setTitle(task.title); setDescription(task.description ?? ""); setIssueType(task.issueType); setStatus(task.status); setPriority(task.priority); setStoryPoints(task.storyPoints?.toString() ?? ""); setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : ""); setAssigneeId(task.assignee?.id ?? ""); setSprintId(task.sprint?.id ?? ""); }}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="panel-card-soft flex min-w-0 flex-col gap-4 rounded-2xl p-4">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
              {ISSUE_TYPE_LABELS[task.issueType]}
            </span>
            {task.storyPoints ? <span className="badge-pill px-2.5 py-1 text-[10px]">{task.storyPoints} pts</span> : null}
            <span className="badge-pill max-w-full truncate px-2.5 py-1 text-[10px]">{task.sprint ? task.sprint.title : "Backlog"}</span>
          </div>
          <h3 className="mt-3 break-words text-base font-semibold leading-6 text-white/88">{task.title}</h3>
          <p className="mt-1 break-words text-sm leading-6 text-white/46">
            {task.description || "No description yet. Add details, acceptance notes, or implementation hints here."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
          <button className="accent-button flex h-9 items-center px-4 text-[11px] font-semibold uppercase tracking-[0.16em] disabled:opacity-60" type="button" onClick={handleAdvance} disabled={isPending || (!canManageTasks && task.assignee?.id !== currentUserId)} aria-busy={isPending}>
            {nextStatus.label}
          </button>
          {canAssignToSelf && task.assignee?.id !== currentUserId ? (
            <button className="secondary-button flex h-9 items-center px-4 text-[11px] font-semibold uppercase tracking-[0.16em]" type="button" onClick={handleAssignToMe} disabled={isPending} aria-busy={isPending}>
              Assign to me
            </button>
          ) : null}
          {canManageTasks && task.assignee?.id === currentUserId ? (
            <button className="secondary-button flex h-9 items-center px-4 text-[11px] font-semibold uppercase tracking-[0.16em]" type="button" onClick={handleUnassign} disabled={isPending} aria-busy={isPending}>
              Release
            </button>
          ) : null}
          {canManageTasks ? (
            <button className="secondary-button flex h-9 items-center px-4 text-[11px] font-semibold uppercase tracking-[0.16em]" type="button" onClick={() => setIsEditing(true)} disabled={isPending} aria-busy={isPending}>
              Edit
            </button>
          ) : null}
          {canDelete ? (
            <button className="flex h-9 items-center rounded-full border border-red-500/20 bg-red-500/5 px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-300 transition hover:bg-red-500/10 disabled:opacity-50" type="button" onClick={handleDelete} disabled={isPending} aria-busy={isPending}>
              Delete
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/28">Status</p>
          <p className="mt-1 break-words text-sm font-semibold text-white/84">{STATUS_LABELS[task.status]}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/28">Priority</p>
          <p className="mt-1 break-words text-sm font-semibold text-white/84">{PRIORITY_LABELS[task.priority]}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/28">Assignee</p>
          <p className="mt-1 break-words text-sm font-semibold text-white/84">{task.assignee ? getPersonLabel(task.assignee) : "Unassigned"}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white/70 p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/28">Due</p>
          <p className="mt-1 break-words text-sm font-semibold text-white/84">{dueMeta ? dueMeta.label : "No due date"}</p>
        </div>
      </div>

      {latestComment ? (
        <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white/42">
          Latest note from <span className="font-semibold text-white/76">{latestComment.author}</span>{" "}
          {formatCommentDate(latestComment.createdAt) ? `on ${formatCommentDate(latestComment.createdAt)}` : "recently"}
        </div>
      ) : null}

      <div className="rounded-[24px] border border-white/[0.08] bg-white/[0.04] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/28">Labels</p>
          {dueMeta ? <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${dueMeta.className}`}>{dueMeta.label}</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {task.labels.length ? task.labels.map((label) => (
            <span key={label.id} className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium" style={{ borderColor: label.color ?? "#3f3f46", color: label.color ?? "#d4d4d8", backgroundColor: label.color ? `${label.color}20` : "rgba(255,255,255,0.04)" }}>
              {label.name}
              {canManageTasks ? (
                <button type="button" className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]" onClick={() => handleRemoveLabel(label)}>
                  x
                </button>
              ) : null}
            </span>
          )) : <span className="text-xs text-white/28">No labels yet.</span>}
        </div>
        {canManageTasks && suggestedLabels.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestedLabels.map((label) => (
              <button key={label.id} type="button" onClick={() => handleAddLabel({ labelId: label.id }, `Added ${label.name}.`)} className="badge-pill px-3 py-1.5 text-[11px] hover:text-white">
                + {label.name}
              </button>
            ))}
          </div>
        ) : null}
        {canManageTasks ? <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={handleCreateLabel}>
          <input className="soft-input h-10 min-w-[180px] flex-1 rounded-2xl px-4 text-sm" placeholder="Create label" value={labelName} onChange={(event) => setLabelName(event.target.value)} />
          <input className="h-10 w-12 rounded-2xl border border-white/10 bg-white/5" type="color" value={labelColor} onChange={(event) => setLabelColor(event.target.value)} aria-label="Label color" />
          <button className="secondary-button flex h-10 items-center px-4 text-[11px] font-semibold uppercase tracking-[0.16em]" type="submit" disabled={isPending} aria-busy={isPending}>
            Add label
          </button>
        </form> : null}
        {labelError ? <p className="mt-2 text-xs feedback-error-text">{labelError}</p> : null}
      </div>

      <div className="rounded-[24px] border border-white/[0.08] bg-white/[0.04] p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/28">Comments</p>
          <span className="text-xs text-white/28">{task.comments.length} total</span>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {task.comments.length ? task.comments.map((comment) => (
            <div key={comment.id} className="rounded-[20px] border border-white/[0.08] bg-[rgba(7,18,25,0.4)] px-4 py-3">
              <p className="text-sm leading-7 text-white/58">{comment.content}</p>
              <p className="mt-1 text-xs text-white/30">{comment.author}{formatCommentDate(comment.createdAt) ? ` / ${formatCommentDate(comment.createdAt)}` : ""}</p>
            </div>
          )) : <p className="text-sm text-white/28">No comments yet.</p>}
        </div>
        <form className="mt-4 flex flex-col gap-2" onSubmit={handleAddComment}>
          <textarea className="soft-input min-h-[90px] rounded-[22px] px-4 py-3 text-sm" placeholder="Write a comment" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} />
          <p className="text-xs text-white/35">Mention a teammate with their email, like @name@example.com.</p>
          <div className="flex items-center justify-between gap-2">
            {commentError ? <span className="text-xs feedback-error-text">{commentError}</span> : <span className="text-xs text-white/30">Keep it short, clear, and actionable.</span>}
            <button className="accent-button flex h-10 items-center px-4 text-[11px] font-semibold uppercase tracking-[0.16em] disabled:opacity-60" type="submit" disabled={isPending} aria-busy={isPending}>
              Add comment
            </button>
          </div>
        </form>
      </div>

      {error ? <p className="text-sm feedback-error-text">{error}</p> : null}
    </div>
  );
}