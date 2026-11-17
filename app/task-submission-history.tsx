"use client";

import { useEffect, useState } from "react";
import SubmissionImageGallery from "@/app/submission-image-gallery";
import type { SubmissionImage } from "@/lib/submission-images";

type Submission = { id: string; notes: string | null; createdAt: string; submitter: string; images: SubmissionImage[] };

export default function TaskSubmissionHistory({ taskId, updatedAt }: { taskId: string; updatedAt: string }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/company-tasks/${encodeURIComponent(taskId)}/submissions`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { ok?: boolean; submissions?: Submission[]; error?: string };
        if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load submissions.");
        setSubmissions(data.submissions ?? []);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load submissions.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [taskId, updatedAt, retry]);

  return <section aria-label="Task submissions">
    <h3 className="text-sm font-semibold">Recent submissions</h3>
    {loading ? <p role="status" className="mt-2 text-xs text-[var(--muted)]">Loading submissions...</p> : null}
    {error ? <p role="alert" className="mt-2 text-xs text-rose-500">{error} <button type="button" onClick={() => setRetry((value) => value + 1)} className="underline">Try again</button></p> : null}
    {!loading && !error && !submissions.length ? <p className="mt-2 text-xs text-[var(--muted)]">No submissions yet.</p> : null}
    {!error ? <div className="mt-3 grid gap-3">{submissions.map((submission) => <article key={submission.id} className="rounded-xl border border-[var(--stroke)] p-3">
      <p className="text-xs font-medium">{submission.submitter}</p>
      <time dateTime={submission.createdAt} className="mt-1 block text-xs text-[var(--muted)]">{new Date(submission.createdAt).toLocaleString()}</time>
      {submission.notes ? <p className="mt-2 whitespace-pre-wrap text-sm">{submission.notes}</p> : null}
      <SubmissionImageGallery images={submission.images} />
      {!submission.notes && !submission.images.length ? <p className="mt-2 text-xs text-[var(--muted)]">Submitted without notes or images.</p> : null}
    </article>)}</div> : null}
  </section>;
}
