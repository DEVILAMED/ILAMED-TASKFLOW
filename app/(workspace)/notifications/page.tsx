"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import WorkspacePageHeading from "@/app/workspace-page-heading";
import UserAvatar from "@/app/user-avatar";

type Notification = { id: string; type: string; message: string; href: string; readAt: string | null; createdAt: string; actor?: { name: string | null; email: string; avatarUrl: string | null } | null };
const titles: Record<string, string> = { PERSONAL_TASK_REMINDER: "Personal task reminder", TASK_SUBMITTED: "Task submitted for approval", TASK_ASSIGNED: "New task assigned", TASK_APPROVED: "Task approved", TASK_REVISION_REQUESTED: "Revision requested", TASK_REJECTED: "Task reviewed", TASK_COMMENTED: "New task update", MENTIONED: "You were mentioned", DUE_DATE_CHANGED: "Deadline updated", TASK_UNASSIGNED: "Task assignment updated" };

export default function NotificationsPage() {
  const [read, setRead] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const invalidRange = Boolean(from && to && from > to);
  const query = new URLSearchParams({ read, type, from, to, page: String(page) }).toString();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const fetching = loading || loadedQuery !== query;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (invalidRange) return;
    try {
      const response = await fetch(`/api/notifications?${query}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load notifications.");
      if (signal?.aborted) return;
      setItems(data.notifications || []); setHasMore(Boolean(data.hasMore)); setUnreadCount(data.unreadCount || 0); setError(null);
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Unable to load notifications."); }
    finally { if (!signal?.aborted) { setLoading(false); setLoadedQuery(query); } }
  }, [query, invalidRange]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); const timer = window.setInterval(() => void refresh(controller.signal), 30000); return () => { controller.abort(); window.clearInterval(timer); }; }, [refresh]);
  async function markRead(notificationId?: string) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(notificationId ? { notificationId } : { markAllRead: true }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to mark notifications as read.");
      setItems(current => current.map(item => !notificationId || item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item));
      window.dispatchEvent(new Event("workspace:notifications-updated"));
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update notifications."); }
    finally { setBusy(false); }
  }
  return <div className="workspace-view">
    <WorkspacePageHeading kicker="INBOX" title="Notifications" action={<button type="button" className="secondary-button workspace-standard-button" disabled={busy || !unreadCount} onClick={() => void markRead()} aria-busy={busy}>Mark all read</button>} />
    {error ? <p role="alert" className="workspace-form-error">{error} <button type="button" onClick={() => void refresh()} className="underline">Try again</button></p> : null}
    <section className="workspace-surface" aria-label="Notification filters">
      <div className="flex flex-wrap items-end gap-3">
        <label className="workspace-field">Read status<select className="soft-input" value={read} onChange={event => { setRead(event.target.value); setPage(1); }}><option value="">All notifications</option><option value="unread">Unread</option><option value="read">Read</option></select></label>
        <label className="workspace-field">Type<select className="soft-input" value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="">All types</option>{Object.entries(titles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="workspace-field">From<input type="date" value={from} max={to || undefined} aria-invalid={invalidRange} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label>
        <label className="workspace-field">To<input type="date" value={to} min={from || undefined} aria-invalid={invalidRange} onChange={event => { setTo(event.target.value); setPage(1); }} /></label>
        <button type="button" className="secondary-button px-3 py-2" onClick={() => { setRead(""); setType(""); setFrom(""); setTo(""); setPage(1); }}>Clear filters</button>
      </div>
      <p className="workspace-field-hint">Date ranges include both days, in India time.</p>
      {invalidRange ? <p role="alert" className="workspace-form-error">The end date must be on or after the start date.</p> : null}
    </section>
    {!invalidRange ? <><section className="workspace-notification-list" aria-label="Notification history">
      {fetching ? <p className="workspace-empty-panel" role="status">Loading notifications…</p> : !items.length && !error ? <p className="workspace-empty-panel">No notifications match this view.</p> : items.map(item => <article key={item.id} className={`workspace-notification-item ${item.readAt ? "" : "is-unread"}`}>
        {item.actor ? <UserAvatar name={item.actor.name || item.actor.email} src={item.actor.avatarUrl} size={40} /> : null}
        <div><h2>{titles[item.type] || "Workspace update"}</h2><p>{item.message}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</time><Link href={item.href} onClick={() => { if (!item.readAt) void markRead(item.id); }}>Open task →</Link></div>
        {!item.readAt ? <span className="workspace-unread-dot" aria-label="Unread" /> : null}
      </article>)}
    </section>
    <div className="flex items-center justify-between gap-3"><button type="button" className="secondary-button px-3 py-2" disabled={page === 1 || fetching} onClick={() => setPage(value => value - 1)}>Previous</button><span className="text-sm" role="status">Page {page}</span><button type="button" className="secondary-button px-3 py-2" disabled={!hasMore || fetching} onClick={() => setPage(value => value + 1)}>Next</button></div></> : null}
  </div>;
}
