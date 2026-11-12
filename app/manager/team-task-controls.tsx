"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TeamTask = {
  id: string;
  title: string;
  status: string;
  assignee: { name: string | null; email: string } | null;
  comments: { id: string; content: string }[];
};

export default function TeamTaskControls({ tasks }: { tasks: TeamTask[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    <p className="mt-1 text-xs text-[var(--muted)]">Review blockers, approve holds, and resume work. Deadlines remain unchanged.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-rose-500">{error}</p> : null}
    {notice ? <p role="status" className="mt-3 text-sm text-[var(--accent)]">{notice}</p> : null}
    {!tasks.length ? <p className="mt-3 text-sm text-[var(--muted)]">No team tasks require hold or resume controls.</p> : null}
    <div className="mt-3 divide-y divide-[var(--stroke)]">{tasks.map((task) => <article key={task.id} className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-sm font-medium">{task.title}</h3><p className="mt-1 text-xs text-[var(--muted)]">{task.assignee?.name || task.assignee?.email} / {task.status.replaceAll("_", " ").toLowerCase()}</p></div>
        <button type="button" disabled={pending} onClick={() => void changeStatus(task)} className={`${task.status === "ON_HOLD" ? "accent-button" : "secondary-button"} px-3 py-2 text-xs disabled:opacity-50`}>{task.status === "ON_HOLD" ? "Resume task" : "Put on hold"}</button>
      </div>
      {task.comments.map((comment) => <p key={comment.id} className="mt-2 whitespace-pre-wrap rounded-lg bg-[var(--panel-soft)] p-3 text-sm text-[var(--muted)]">{comment.content}</p>)}
    </article>)}</div>
  </section>;
}
