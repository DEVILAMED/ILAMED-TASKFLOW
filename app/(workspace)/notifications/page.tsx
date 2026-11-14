"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import WorkspacePageHeading from "@/app/workspace-page-heading";

type Notification = { id: string; type: string; message: string; href: string; readAt: string | null; createdAt: string };
const titles: Record<string, string> = { TASK_SUBMITTED: "Task submitted for approval", TASK_ASSIGNED: "New task assigned", TASK_APPROVED: "Task approved", TASK_REVISION_REQUESTED: "Revision requested", TASK_REJECTED: "Task reviewed", TASK_COMMENTED: "New task update", MENTIONED: "You were mentioned", DUE_DATE_CHANGED: "Deadline updated", TASK_UNASSIGNED: "Task assignment updated" };

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load notifications.");
      setItems(data.notifications || []); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load notifications."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 30000); return () => window.clearInterval(timer); }, [refresh]);
  async function markRead(notificationId?: string) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(notificationId ? { notificationId } : { markAllRead: true }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to mark notifications as read.");
      setItems(current => current.map(item => !notificationId || item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item));
      window.dispatchEvent(new Event("workspace:notifications-updated"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update notifications."); }
    finally { setBusy(false); }
  }
  return <div className="workspace-view">
    <WorkspacePageHeading kicker="INBOX" title="Notifications" action={<button type="button" className="secondary-button workspace-standard-button" disabled={busy || !items.some(item => !item.readAt)} onClick={() => void markRead()} aria-busy={busy}>Mark all read</button>} />
    {error ? <p role="alert" className="workspace-form-error">{error} <button type="button" onClick={() => void refresh()} className="underline">Try again</button></p> : null}
    <section className="workspace-notification-list" aria-label="Notification history">
      {loading ? <p className="workspace-empty-panel" role="status">Loading notifications…</p> : !items.length && !error ? <p className="workspace-empty-panel">You’re all caught up.</p> : items.map(item => <article key={item.id} className={`workspace-notification-item ${item.readAt ? "" : "is-unread"}`}>
        <div><h2>{titles[item.type] || "Workspace update"}</h2><p>{item.message}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</time><Link href={item.href} onClick={() => { if (!item.readAt) void markRead(item.id); }}>Open task →</Link></div>
        {!item.readAt ? <span className="workspace-unread-dot" aria-label="Unread" /> : null}
      </article>)}
    </section>
  </div>;
}
