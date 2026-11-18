"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import SubmissionImageGallery from "@/app/submission-image-gallery";
import type { SubmissionImage } from "@/lib/submission-images";
import { isReviewRating, REVIEW_RUBRIC } from "@/lib/review-quality";
import UserAvatar from "@/app/user-avatar";

type ReviewTask = {
  id: string; title: string; description: string | null; dueDate: string | null;
  recurrenceDate?: string | null;
  assignee: { name: string | null; email: string; avatarUrl?: string | null } | null;
  submission: { id: string; notes: string | null; createdAt: string; submitter: string; submitterAvatarUrl?: string | null; images: SubmissionImage[] } | null;
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
    const reviewKey = task.submission?.id;
    if (!reviewKey) { setError("This task has no pending submission. Refresh the queue."); return; }
    const rating = Number(ratings[reviewKey]);
    if (!isReviewRating(rating)) { setError("Select a quality rating using the criteria below."); return; }
    setPending(task.id); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/company-tasks/${task.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, rating, feedback: feedback[reviewKey] || "", submissionId: reviewKey }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save this review.");
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setNotice(`Review saved for “${task.title}”.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this review."); }
    finally { setPending(null); }
  }

  return <div className="flex flex-col gap-4">
    <section className="workspace-surface performance-methodology">
      <h2>Quality rating criteria</h2>
      <p>Assess the submitted work against its agreed acceptance criteria. Select a rating deliberately and describe the evidence in your feedback, including any corrections needed or added value. Consider task complexity and dependencies when discussing delivery.</p>
      <details><summary>View the 1–5 rating guide</summary><ol>{REVIEW_RUBRIC.map(item => <li key={item.rating}><strong>{item.rating}/5 · {item.label}.</strong> {item.description}</li>)}</ol></details>
    </section>
    {error ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{notice}</p> : null}
    {selectedTask ? <div className="text-sm text-[var(--muted)]">{!loading && !tasks.some((task) => task.id === selectedTask) ? "This submission is no longer awaiting review or is unavailable." : "Showing the selected submission."} <button type="button" className="text-[var(--accent)] underline" onClick={() => { const url = new URL(window.location.href); url.searchParams.delete("task"); window.history.replaceState(null, "", url); }}>Show all submissions</button></div> : null}
    {loading ? <p role="status" className="p-6 text-sm text-[var(--muted)]">Loading submissions...</p> : null}
    {!loading && !tasks.length && !error ? <p className="workspace-empty-panel">Nothing in the queue right now.</p> : null}
    {tasks.filter((task) => !selectedTask || task.id === selectedTask).map((task) => {
      const reviewKey = task.submission?.id ?? task.id;
      return <article key={reviewKey} className="panel-card rounded-2xl p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex items-center gap-3"><UserAvatar name={task.submission?.submitter || task.assignee?.name || task.assignee?.email || "Employee"} src={task.submission ? task.submission.submitterAvatarUrl : task.assignee?.avatarUrl} /><div><h2 className="font-semibold text-white/90">{task.title}</h2><p className="mt-1 text-xs text-white/45">Submitted by {task.submission?.submitter ?? "employee"} · {task.assignee?.name || task.assignee?.email}</p></div></div>
        <span className="text-xs text-white/40">{task.submission ? new Date(task.submission.createdAt).toLocaleString() : ""}</span>
      </div>
      {task.description ? <p className="mt-3 whitespace-pre-wrap text-sm text-white/65">{task.description}</p> : null}
      {task.recurrenceDate ? <p className="mt-2 text-sm font-medium text-[var(--accent)]">Daily submission for {task.recurrenceDate.slice(0, 10)}</p> : null}
      {task.submission?.notes ? <p className="mt-3 rounded-xl bg-white/[0.04] p-3 text-sm text-white/65">{task.submission.notes}</p> : null}
      {task.submission ? <SubmissionImageGallery images={task.submission.images} /> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid min-w-0 gap-1 text-xs text-white/50">Quality rating<select className="soft-input h-10 rounded-lg px-2" required value={ratings[reviewKey] ?? ""} onChange={(event) => setRatings((current) => ({ ...current, [reviewKey]: event.target.value }))}><option value="" disabled>Select rating</option>{REVIEW_RUBRIC.map(item => <option key={item.rating} value={item.rating}>{item.rating}/5 · {item.label}</option>)}</select></label>
        <label className="grid min-w-0 gap-1 text-xs text-white/50">Evidence and feedback<textarea className="soft-input min-h-10 rounded-lg px-3 py-2 text-sm" required maxLength={2000} value={feedback[reviewKey] ?? ""} onChange={(event) => setFeedback((current) => ({ ...current, [reviewKey]: event.target.value }))} placeholder="Explain how the work meets the criteria, corrections needed, or specific added value" /></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {([["APPROVED", "Approve"], ["REVISION_REQUESTED", "Request revision"], ["REJECTED", "Reject"]] as const).map(([decision, label]) => <button key={decision} type="button" disabled={pending === task.id || !task.submission || !isReviewRating(Number(ratings[reviewKey])) || !(feedback[reviewKey] ?? "").trim()} onClick={() => void review(task, decision)} className="secondary-button px-3 py-2 text-xs font-semibold disabled:opacity-40">{pending === task.id ? "Saving…" : label}</button>)}
      </div>
    </article>; })}
  </div>;
}
