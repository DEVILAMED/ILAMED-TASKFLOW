"use client";

import { useEffect, useState } from "react";

type Change = { id: string; action: string; before: Record<string, unknown>; after: Record<string, unknown>; createdAt: string; actor: { name: string | null; email: string } };
const fieldLabels: Record<string, string> = { title: "Title", description: "Instructions", priority: "Priority", startDate: "Start date", dueDate: "End date", assigneeId: "Assigned to", checklist: "Checklist", archivedAt: "Archived", deletedAt: "In recycle bin", isCompleted: "Step completed" };
function historyValue(key: string, value: unknown, snapshot: Record<string, unknown>) {
  if (key === "assigneeId") return value ? String(snapshot.assigneeName || "Employee changed") : "Unassigned";
  if (key === "archivedAt" || key === "deletedAt") return value ? "Yes" : "No";
  if (key === "startDate" || key === "dueDate") return typeof value === "string" ? value.slice(0, 10) : "Not set";
  if (key === "checklist" && Array.isArray(value)) return value.map(item => `${item.isCompleted ? "Done" : "Pending"}: ${item.title}`).join("\n") || "No checklist";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value == null || value === "" ? "Not set" : String(value);
}
export default function TaskChangeHistory({ taskId, updatedAt }: { taskId: string; updatedAt: string }) {
  const [changes, setChanges] = useState<Change[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => { setPage(1); setChanges([]); }, [taskId, updatedAt]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/company-tasks/${encodeURIComponent(taskId)}/changes?page=${page}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load change history.");
        if (controller.signal.aborted) return;
        setChanges(current => page === 1 ? data.changes : [...current.filter(item => !data.changes.some((next: Change) => next.id === item.id)), ...data.changes]);
        setHasMore(data.hasMore);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load change history."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [taskId, updatedAt, page, retry]);
  return <section className="rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] p-5 sm:p-6"><h2 className="text-base font-semibold">Task change history</h2><p className="mt-1 text-xs text-[var(--muted)]">Recorded edits and lifecycle actions. Earlier changes made before history tracking was introduced may be unavailable.</p>
    {changes.map(change => <article key={change.id} className="mt-4 border-t border-[var(--stroke)] pt-3"><p className="text-sm font-medium">{change.action.replaceAll("_", " ").toLowerCase()} · {change.actor.name || change.actor.email}</p><time className="text-xs text-[var(--muted)]">{new Date(change.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</time><dl className="mt-2 space-y-2 text-xs">{Object.keys(change.after).filter(key => key in fieldLabels && JSON.stringify(change.before[key]) !== JSON.stringify(change.after[key])).map(key => <div key={key}><dt className="font-medium">{fieldLabels[key]}</dt><dd className="whitespace-pre-wrap break-words text-[var(--muted)]">{historyValue(key, change.before[key], change.before)} → {historyValue(key, change.after[key], change.after)}</dd></div>)}</dl></article>)}
    {error ? <p role="alert" className="mt-3 text-sm text-rose-500">{error} <button type="button" onClick={() => setRetry(current => current + 1)} className="underline">Try again</button></p> : null}
    {loading ? <p role="status" className="mt-3 text-xs text-[var(--muted)]">Loading history…</p> : !changes.length && !error ? <p className="mt-3 text-sm text-[var(--muted)]">No task edits recorded.</p> : null}
    {hasMore ? <button type="button" disabled={loading} onClick={() => setPage(current => current + 1)} className="secondary-button mt-4 px-3 py-2 text-sm">Load earlier changes</button> : null}
  </section>;
}
