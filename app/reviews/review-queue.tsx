"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type ReviewTask = {
  id: string; title: string; description: string | null; dueDate: string | null;
  assignee: { name: string | null; email: string } | null;
  submission: { id: string; notes: string | null; createdAt: string; submitter: string } | null;
};

export default function ReviewQueue() {
  const selectedTask = useSearchParams().get("task");
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/company-tasks/review-queue", { cache: "no-store" });
    const data = await response.json() as { ok?: boolean; tasks?: ReviewTask[]; error?: string };
    if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load the review queue.");
    setTasks(data.tasks ?? []);
  }

  useEffect(() => { void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load reviews.")).finally(() => setLoading(false)); }, []);

  useEffect(() => {
    async function reload() {
      if (document.visibilityState !== "visible" || pending) return;
      try { await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to refresh reviews."); }
    }
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    const timer = window.setInterval(reload, 60000);
    return () => { window.removeEventListener("focus", reload); document.removeEventListener("visibilitychange", reload); window.clearInterval(timer); };
  }, [pending]);

  async function review(task: ReviewTask, decision: "APPROVED" | "REVISION_REQUESTED" | "REJECTED") {
    setPending(task.id); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/company-tasks/${task.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, rating: Number(ratings[task.id] ?? "5"), feedback: feedback[task.id] || "" }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save this review.");
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setNotice(`Review saved for “${task.title}”.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this review."); }
    finally { setPending(null); }
  }

  return <div className="flex flex-col gap-4">
    {error ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{notice}</p> : null}
    {selectedTask ? <div className="text-sm text-[var(--muted)]">{!loading && !tasks.some((task) => task.id === selectedTask) ? "This submission is no longer awaiting review or is unavailable." : "Showing the selected submission."} <button type="button" className="text-[var(--accent)] underline" onClick={() => { const url = new URL(window.location.href); url.searchParams.delete("task"); window.history.replaceState(null, "", url); }}>Show all submissions</button></div> : null}
    {loading ? <p role="status" className="p-6 text-sm text-[var(--muted)]">Loading submissions...</p> : null}
    {!loading && !tasks.length && !error ? <p className="rounded-2xl border border-white/[0.07] p-6 text-sm text-white/50">No submissions are waiting for review.</p> : null}
    {tasks.filter((task) => !selectedTask || task.id === selectedTask).map((task) => <article key={task.id} className="panel-card rounded-2xl p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div><h2 className="font-semibold text-white/90">{task.title}</h2><p className="mt-1 text-xs text-white/45">Submitted by {task.submission?.submitter ?? "employee"} · {task.assignee?.name || task.assignee?.email}</p></div>
        <span className="text-xs text-white/40">{task.submission ? new Date(task.submission.createdAt).toLocaleString() : ""}</span>
      </div>
      {task.description ? <p className="mt-3 whitespace-pre-wrap text-sm text-white/65">{task.description}</p> : null}
      {task.submission?.notes ? <p className="mt-3 rounded-xl bg-white/[0.04] p-3 text-sm text-white/65">{task.submission.notes}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr]">
        <label className="grid gap-1 text-xs text-white/50">Quality rating<select className="soft-input h-10 rounded-lg px-2" value={ratings[task.id] ?? "5"} onChange={(event) => setRatings((current) => ({ ...current, [task.id]: event.target.value }))}>{[1,2,3,4,5].map((score) => <option key={score} value={score}>{score} / 5</option>)}</select></label>
        <label className="grid gap-1 text-xs text-white/50">Feedback<textarea className="soft-input min-h-10 rounded-lg px-3 py-2 text-sm" maxLength={2000} value={feedback[task.id] ?? ""} onChange={(event) => setFeedback((current) => ({ ...current, [task.id]: event.target.value }))} placeholder="Add feedback for the employee" /></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {([["APPROVED", "Approve"], ["REVISION_REQUESTED", "Request revision"], ["REJECTED", "Reject"]] as const).map(([decision, label]) => <button key={decision} type="button" disabled={pending === task.id || !(feedback[task.id] ?? "").trim()} onClick={() => void review(task, decision)} className="secondary-button px-3 py-2 text-xs font-semibold disabled:opacity-40">{pending === task.id ? "Saving…" : label}</button>)}
      </div>
    </article>)}
  </div>;
}
