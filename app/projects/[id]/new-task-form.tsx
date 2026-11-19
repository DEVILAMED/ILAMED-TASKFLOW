"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type NotificationType = "success" | "error" | "info";
type IssueType = "EPIC" | "STORY" | "TASK" | "BUG";
type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

type ProjectMember = {
  id: string;
  name: string | null;
  email: string;
  role: "OWNER" | "MEMBER";
};

type SprintOption = {
  id: string;
  title: string;
  isActive: boolean;
};

type NewTaskFormProps = {
  projectId: string;
  members: ProjectMember[];
  sprints: SprintOption[];
  onNotify?: (message: string, type?: NotificationType) => void;
};

type FormState = {
  title: string;
  description: string;
  issueType: IssueType;
  status: TaskStatus;
  priority: TaskPriority;
  storyPoints: string;
  dueDate: string;
  assigneeId: string;
  sprintId: string;
};

const DEFAULT_FORM: FormState = {
  title: "",
  description: "",
  issueType: "TASK",
  status: "TODO",
  priority: "MEDIUM",
  storyPoints: "",
  dueDate: "",
  assigneeId: "",
  sprintId: "",
};

function getPersonLabel(member: { name: string | null; email: string }) {
  return member.name || member.email;
}

function formatDateInput(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export default function NewTaskForm({
  projectId,
  members,
  sprints,
  onNotify,
}: NewTaskFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [isOpen, setIsOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const activeSprint = sprints.find((sprint) => sprint.isActive) ?? null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target?.closest("input, textarea, select, [contenteditable='true']"),
      );

      if (!isTyping && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setIsOpen(true);
        window.setTimeout(() => titleRef.current?.focus(), 0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const applyTemplate = (template: Partial<FormState>) => {
    setIsOpen(true);
    setForm((current) => ({
      ...current,
      ...template,
    }));
    window.setTimeout(() => titleRef.current?.focus(), 0);
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const title = form.title.trim();
    const description = form.description.trim();

    if (title.length < 2) {
      setError("Task title must be at least 2 characters.");
      return;
    }

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        title,
        description,
        issueType: form.issueType,
        status: form.status,
        priority: form.priority,
        storyPoints: form.storyPoints || null,
        dueDate: form.dueDate || null,
        assigneeId: form.assigneeId || null,
        sprintId: form.sprintId || null,
      }),
    });

    if (response.ok) {
      resetForm();
      onNotify?.(`Created ${form.issueType.toLowerCase()} "${title}"`, "success");
      startTransition(() => {
        router.refresh();
      });
      return;
    }

    const data = await response.json().catch(() => ({}));
    const message = data.error || "Unable to create task.";
    setError(message);
    onNotify?.(message, "error");
  };

  return (
    <form id="task-composer" className="panel-card rounded-[32px] p-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/30">Quick issue composer</p>
          <h3 className="mt-3 text-2xl font-semibold text-white/90">Create work with a little more momentum.</h3>
          <p className="mt-2 text-sm leading-7 text-white/42">
            Open the composer with the <span className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/62">N</span> key, use a template, and drop work straight into the backlog or an active sprint.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsOpen((value) => !value)}
            className="secondary-button flex h-10 items-center px-4 text-xs font-semibold uppercase tracking-[0.16em]"
          >
            {isOpen ? "Collapse" : "Expand"}
          </button>
          <button
            type={isOpen ? "submit" : "button"}
            onClick={!isOpen ? () => setIsOpen(true) : undefined}
            disabled={isPending}
            aria-busy={isPending && isOpen}
            className="accent-button flex h-10 items-center px-5 text-xs font-semibold uppercase tracking-[0.16em] disabled:opacity-60"
          >
            {isOpen ? (isPending ? "Creating..." : "Create issue") : "Open composer"}
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/56">
        <button type="button" onClick={() => applyTemplate({ issueType: "BUG", priority: "HIGH", status: "IN_PROGRESS", sprintId: activeSprint?.id ?? form.sprintId })} className="badge-pill hover:text-white">
          Bug fix
        </button>
        <button type="button" onClick={() => applyTemplate({ issueType: "TASK", priority: "MEDIUM", status: "TODO", sprintId: activeSprint?.id ?? "" })} className="badge-pill hover:text-white">
          Sprint-ready
        </button>
        <button type="button" onClick={() => applyTemplate({ issueType: "STORY", priority: "MEDIUM", status: "TODO", sprintId: "" })} className="badge-pill hover:text-white">
          Discovery story
        </button>
        {activeSprint ? <span className="badge-pill">Active sprint: {activeSprint.title}</span> : <span className="badge-pill">No active sprint</span>}
      </div>

      {isOpen ? (
        <>
          <div className="mt-5 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="grid gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
                Title
                <input
                  ref={titleRef}
                  className="soft-input h-12 rounded-2xl px-4 text-sm"
                  value={form.title}
                  onChange={(event) => handleChange("title", event.target.value)}
                  placeholder="Checkout error handling"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
                Description
                <textarea
                  className="soft-input min-h-[118px] rounded-[24px] px-4 py-3 text-sm"
                  value={form.description}
                  onChange={(event) => handleChange("description", event.target.value)}
                  placeholder="Optional context, notes, or acceptance criteria"
                  rows={4}
                />
              </label>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
                  Issue type
                  <select className="soft-input h-12 rounded-2xl px-3 text-sm" value={form.issueType} onChange={(event) => handleChange("issueType", event.target.value as IssueType)}>
                    <option value="EPIC">Epic</option>
                    <option value="STORY">Story</option>
                    <option value="TASK">Task</option>
                    <option value="BUG">Bug</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
                  Status
                  <select className="soft-input h-12 rounded-2xl px-3 text-sm" value={form.status} onChange={(event) => handleChange("status", event.target.value as TaskStatus)}>
                    <option value="TODO">Todo</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="DONE">Done</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
                  Priority
                  <select className="soft-input h-12 rounded-2xl px-3 text-sm" value={form.priority} onChange={(event) => handleChange("priority", event.target.value as TaskPriority)}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
                  Story points
                  <input className="soft-input h-12 rounded-2xl px-3 text-sm" value={form.storyPoints} onChange={(event) => handleChange("storyPoints", event.target.value)} type="number" min="1" max="100" step="1" placeholder="Optional" />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
                  Due date
                  <input className="soft-input h-12 rounded-2xl px-3 text-sm" value={form.dueDate} onChange={(event) => handleChange("dueDate", event.target.value)} type="date" />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
                  Assignee
                  <select className="soft-input h-12 rounded-2xl px-3 text-sm" value={form.assigneeId} onChange={(event) => handleChange("assigneeId", event.target.value)}>
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>{getPersonLabel(member)}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-white/52">
                  Sprint
                  <select className="soft-input h-12 rounded-2xl px-3 text-sm" value={form.sprintId} onChange={(event) => handleChange("sprintId", event.target.value)}>
                    <option value="">Backlog</option>
                    {sprints.map((sprint) => (
                      <option key={sprint.id} value={sprint.id}>{sprint.isActive ? `[Active] ${sprint.title}` : sprint.title}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/56">
            <button type="button" onClick={() => handleChange("dueDate", formatDateInput(0))} className="badge-pill hover:text-white">Due today</button>
            <button type="button" onClick={() => handleChange("dueDate", formatDateInput(3))} className="badge-pill hover:text-white">In 3 days</button>
            <button type="button" onClick={() => handleChange("dueDate", formatDateInput(7))} className="badge-pill hover:text-white">Next week</button>
            <button type="button" onClick={() => handleChange("dueDate", "")} className="badge-pill hover:text-white">Clear date</button>
            <button type="button" onClick={resetForm} className="badge-pill hover:text-white">Reset fields</button>
          </div>
        </>
      ) : (
        <p className="mt-5 text-sm leading-7 text-white/38">
          Open the composer to use templates, quick due dates, and sprint targeting.
        </p>
      )}

      {error ? (
        <p className="mt-4 feedback-error rounded-2xl border px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
    </form>
  );
}