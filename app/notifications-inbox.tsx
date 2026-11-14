"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

type InboxNotification = {
  id: string;
  type: string;
  message: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

type InboxResponse = {
  ok?: boolean;
  error?: string;
  unreadCount?: number;
  notifications?: InboxNotification[];
};

export default function NotificationsInbox({ sidebar = false }: { sidebar?: boolean } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json() as InboxResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to load notifications.");
      }
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load notifications.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const updated = () => void refresh();
    window.addEventListener("workspace:notifications-updated", updated);
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { window.clearInterval(timer); window.removeEventListener("workspace:notifications-updated", updated); };
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
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void refresh();
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
        <div className={`${sidebar ? "fixed left-4 top-20" : "absolute right-0 top-12"} z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10`}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Notifications</h2>
              <p className="mt-0.5 text-xs text-slate-500">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              onClick={() => void markRead()}
              disabled={unreadCount === 0 || busyId !== null}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Mark all read
            </button>
          </div>
          {error ? <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p> : null}
          <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
            {notifications.length ? notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => void openNotification(notification)}
                disabled={busyId !== null}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 disabled:opacity-60 ${notification.readAt ? "" : "bg-indigo-50/60"}`}
              >
                <span className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? "bg-transparent" : "bg-indigo-600"}`} />
                  <span className="min-w-0">
                    <span className="block text-sm leading-5 text-slate-700">{notification.message}</span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {new Date(notification.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </span>
                </span>
              </button>
            )) : (
              <p className="px-4 py-10 text-center text-sm text-slate-500">You&apos;re all caught up.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
