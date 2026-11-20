"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import SubmissionImageGallery from "@/app/submission-image-gallery";
import type { SubmissionImage } from "@/lib/submission-images";
import { isReviewRating, REVIEW_RUBRIC } from "@/lib/review-quality";
import UserAvatar from "@/app/user-avatar";
import { filterApprovals, readApprovalFilters } from "@/lib/approval-filters";

type ReviewTask = {
  id: string; title: string; description: string | null; dueDate: string | null;
  recurrenceDate?: string | null;
  assignee: { id: string; name: string | null; email: string; avatarUrl?: string | null } | null;
  submission: { id: string; notes: string | null; createdAt: string; submitter: string; submitterAvatarUrl?: string | null; images: SubmissionImage[] } | null;
};

export default function ReviewQueue() {
  const params = useSearchParams();
  const filters = readApprovalFilters(params);
  const selectedTask = filters.task;
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function setFilter(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
  }

  function clearFilters() {
    const url = new URL(window.location.href);
    for (const key of ["q", "user", "date", "from", "to", "sort"]) url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
  }

  const users = [...new Map(tasks.flatMap(task => task.assignee ? [[task.assignee.id, task.assignee] as const] : [])).values()]
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  const visibleTasks = filterApprovals(tasks, filters);
  const invalidRange = Boolean(filters.from && filters.to && filters.from > filters.to);
  const hasFilters = Boolean(filters.query || filters.user || filters.from || filters.to || filters.dateField !== "submitted" || filters.sort !== "queue");

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
    <section aria-label="Approval filters" className="workspace-surface rounded-2xl p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="grid min-w-0 gap-1 text-xs text-[var(--muted)]">Search submissions<input type="search" className="soft-input h-10 rounded-lg px-3 text-sm" placeholder="Task, user, or submission notes" value={filters.query} onChange={event => setFilter("q", event.target.value)} /></label>
        <label className="grid min-w-0 gap-1 text-xs text-[var(--muted)]">User<select className="soft-input h-10 rounded-lg px-2" value={filters.user} onChange={event => setFilter("user", event.target.value)}><option value="">All users</option>{filters.user && !users.some(user => user.id === filters.user) ? <option value={filters.user}>Selected user (no pending submissions)</option> : null}{users.map(user => <option key={user.id} value={user.id}>{user.name ? `${user.name} (${user.email})` : user.email}</option>)}</select></label>
        <label className="grid min-w-0 gap-1 text-xs text-[var(--muted)]">Filter dates by<select className="soft-input h-10 rounded-lg px-2" value={filters.dateField} onChange={event => setFilter("date", event.target.value)}><option value="submitted">Submission date</option><option value="due">Due date</option></select></label>
        <label className="grid min-w-0 gap-1 text-xs text-[var(--muted)]">From date<input type="date" className="soft-input h-10 rounded-lg px-3" value={filters.from} max={filters.to || undefined} aria-invalid={invalidRange} aria-describedby={invalidRange ? "approval-date-error" : undefined} onChange={event => setFilter("from", event.target.value)} /></label>
        <label className="grid min-w-0 gap-1 text-xs text-[var(--muted)]">To date<input type="date" className="soft-input h-10 rounded-lg px-3" value={filters.to} min={filters.from || undefined} aria-invalid={invalidRange} aria-describedby={invalidRange ? "approval-date-error" : undefined} onChange={event => setFilter("to", event.target.value)} /></label>
        <label className="grid min-w-0 gap-1 text-xs text-[var(--muted)]">Sort by<select className="soft-input h-10 rounded-lg px-2" value={filters.sort} onChange={event => setFilter("sort", event.target.value)}><option value="queue">Due date (queue order)</option><option value="newest">Newest submission</option><option value="oldest">Oldest submission</option></select></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]"><p role="status">{loading ? "Loading submissions..." : `${visibleTasks.length} of ${tasks.length} pending submissions`}. Date ranges include both days; submission dates use India time.</p><button type="button" disabled={!hasFilters} onClick={clearFilters} className="secondary-button px-3 py-2 disabled:opacity-40">Clear filters</button></div>
      {invalidRange ? <p id="approval-date-error" role="alert" className="mt-2 text-sm text-rose-500">From date must be on or before To date.</p> : null}
    </section>
    <section className="workspace-surface performance-methodology">
      <h2>Quality rating criteria</h2>
      <p>Assess the submitted work against its agreed acceptance criteria. Select a rating deliberately and describe the evidence in your feedback, including any corrections needed or added value. Consider task complexity and dependencies when discussing delivery.</p>
      <details><summary>View the 1–5 rating guide</summary><ol>{REVIEW_RUBRIC.map(item => <li key={item.rating}><strong>{item.rating}/5 · {item.label}.</strong> {item.description}</li>)}</ol></details>
    </section>
    {error ? <p role="alert" className="feedback-error rounded-xl border p-3 text-sm">{error}</p> : null}
    {notice ? <p role="status" className="feedback-success rounded-xl border p-3 text-sm">{notice}</p> : null}
    {selectedTask ? <div className="text-sm text-[var(--muted)]">{loading ? "Loading the selected submission..." : !tasks.some((task) => task.id === selectedTask) ? "This submission is no longer awaiting review or is unavailable." : !visibleTasks.length ? "The selected submission is hidden by your filters." : "Showing the selected submission."} <button type="button" className="text-[var(--accent)] underline" onClick={() => setFilter("task", "")}>Show all submissions</button></div> : null}
    {loading ? <p role="status" className="p-6 text-sm text-[var(--muted)]">Loading submissions...</p> : null}
    {!loading && !tasks.length && !error ? <p className="workspace-empty-panel">Nothing in the queue right now.</p> : null}
    {!loading && tasks.length > 0 && !visibleTasks.length && !invalidRange && !error ? <p className="workspace-empty-panel">No pending submissions match your filters.{hasFilters ? " Clear filters or choose a different user or date range." : ""}</p> : null}
    {visibleTasks.map((task) => {
      const reviewKey = task.submission?.id ?? task.id;
      return <article key={reviewKey} className="panel-card rounded-2xl p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex items-center gap-3"><UserAvatar name={task.submission?.submitter || task.assignee?.name || task.assignee?.email || "Employee"} src={task.submission ? task.submission.submitterAvatarUrl : task.assignee?.avatarUrl} /><div><h2 className="font-semibold text-white/90">{task.title}</h2><p className="mt-1 text-xs text-white/45">Submitted by {task.submission?.submitter ?? "employee"} · {task.assignee?.name || task.assignee?.email}</p></div></div>
        <span className="text-xs text-white/40">{task.submission ? `${new Date(task.submission.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST` : ""}</span>
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
