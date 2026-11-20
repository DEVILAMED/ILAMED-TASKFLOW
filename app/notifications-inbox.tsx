"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import UserAvatar from "@/app/user-avatar";
import { announceMenuOpened, installMenuDismissal } from "@/lib/dismissible-menu";

type InboxNotification = {
  id: string;
  type: string;
  message: string;
  href: string;
  readAt: string | null;
  createdAt: string;
  actor?: { name: string | null; email: string; avatarUrl: string | null } | null;
};

type InboxResponse = {
  ok?: boolean;
  error?: string;
  unreadCount?: number;
  notifications?: InboxNotification[];
};

export default function NotificationsInbox({ sidebar = false }: { sidebar?: boolean } = {}) {
  const router = useRouter();
  const refreshVersion = useRef({ value: 0 });
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !container.current) return;
    return installMenuDismissal({ container: container.current, trigger: trigger.current, isOpen: () => true, close: () => setOpen(false) });
  }, [open]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const version = ++refreshVersion.current.value;
    try {
      const response = await fetch("/api/notifications", { cache: "no-store", signal });
      const data = await response.json() as InboxResponse;
      if (signal?.aborted || version !== refreshVersion.current.value) return;
      if (!response.ok || !data.ok) {
        if (response.status === 401 || response.status === 403) { setNotifications([]); setUnreadCount(0); }
        throw new Error(data.error || "Unable to load notifications.");
      }
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      setError(null);
    } catch (loadError) {
      if (!signal?.aborted && version === refreshVersion.current.value) setError(loadError instanceof Error ? loadError.message : "Unable to load notifications.");
    } finally {
      if (!signal?.aborted && version === refreshVersion.current.value) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestState = refreshVersion.current;
    const updated = () => { if (document.visibilityState === "visible") void refresh(controller.signal); };
    void refresh(controller.signal);
    window.addEventListener("workspace:notifications-updated", updated);
    window.addEventListener("focus", updated);
    document.addEventListener("visibilitychange", updated);
    const timer = window.setInterval(updated, 30_000);
    return () => {
      controller.abort();
      requestState.value++;
      window.clearInterval(timer);
      window.removeEventListener("workspace:notifications-updated", updated);
      window.removeEventListener("focus", updated);
      document.removeEventListener("visibilitychange", updated);
    };
  }, [refresh]);

  async function markRead(notificationId?: string) {
    setBusyId(notificationId ?? "all");
    setError(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationId ? { notificationId } : { markAllRead: true }),
      });
      const data = await response.json() as InboxResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to update notifications.");
      }

      if (notificationId) {
        setNotifications((current) => current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, readAt: new Date().toISOString() }
            : notification,
        ));
        setUnreadCount((count) => Math.max(0, count - 1));
      } else {
        const readAt = new Date().toISOString();
        setNotifications((current) => current.map((notification) => ({ ...notification, readAt })));
        setUnreadCount(0);
      }
      window.dispatchEvent(new Event("workspace:notifications-updated"));
      return true;
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update notifications.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function openNotification(notification: InboxNotification) {
    if (!notification.readAt) void markRead(notification.id);
    setOpen(false);
    router.push(notification.href);
  }

  return (
    <div ref={container} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) {
            if (container.current) announceMenuOpened(container.current);
            void refresh();
          }
        }}
        className={sidebar ? "workspace-nav-item w-full text-left" : "workspace-notification-button"}
      >
        <Bell aria-hidden="true" size={18} strokeWidth={1.7} />
        {sidebar ? <span className="flex-1">Notifications</span> : null}
        {unreadCount > 0 ? (
          <span className={sidebar ? "workspace-nav-badge" : "workspace-notification-badge"}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div id={panelId} className={`${sidebar ? "fixed left-4 top-20" : "fixed right-4 top-20 sm:absolute sm:right-0 sm:top-12"} z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--panel)] text-[var(--foreground)] shadow-xl shadow-slate-900/10`}>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--stroke)] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Notifications</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              onClick={() => void markRead()}
              disabled={unreadCount === 0 || busyId !== null}
              className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>
          {error ? <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p> : null}
          <div className="max-h-[min(28rem,60dvh)] overflow-y-auto overscroll-contain" aria-label="Recent notifications">
            {loading ? <p role="status" className="px-4 py-10 text-center text-sm text-[var(--muted)]">Loading notifications...</p> : notifications.length ? notifications.map(notification => (
              <button key={notification.id} type="button" onClick={() => void openNotification(notification)} disabled={busyId !== null}
                className={`grid w-full grid-cols-[32px_minmax(0,1fr)_8px] items-start gap-3 border-b border-[var(--stroke)] px-4 py-3 text-left transition hover:bg-[var(--panel-soft)] disabled:opacity-60 ${notification.readAt ? "" : "bg-[var(--panel-soft)]"}`}>
                <UserAvatar name={notification.actor?.name || notification.actor?.email || "Workspace"} src={notification.actor?.avatarUrl} size={32} />
                <span className="min-w-0">
                  <span className="block text-sm leading-5 text-[var(--foreground)] [overflow-wrap:anywhere]">{notification.message}</span>
                  <time dateTime={notification.createdAt} className="mt-1 block text-xs text-[var(--muted)]">{new Date(notification.createdAt).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</time>
                </span>
                <span aria-label={notification.readAt ? undefined : "Unread"} className={`mt-1.5 h-2 w-2 rounded-full ${notification.readAt ? "bg-transparent" : "bg-[var(--accent)]"}`} />
              </button>
            )) : <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">You&apos;re all caught up.</p>}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-[var(--stroke)] px-4 py-3 text-center text-sm font-medium text-[var(--accent)] hover:bg-[var(--panel-soft)]">View all notifications</Link>
        </div>
      ) : null}
    </div>
  );
}
