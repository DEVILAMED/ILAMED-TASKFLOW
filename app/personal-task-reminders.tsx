"use client";

import { useEffect } from "react";

export default function PersonalTaskReminders() {
  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    async function check() {
      if (inFlight || !("Notification" in window) || Notification.permission !== "granted") return;
      inFlight = true;
      try {
        const response = await fetch("/api/personal-task-reminders", { method: "POST", cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { reminders?: { id: string; message: string; href: string }[] };
        if (stopped || Notification.permission !== "granted") return;
        for (const reminder of data.reminders ?? []) {
          try {
            const alert = new Notification("Task reminder", { body: reminder.message, tag: `ilamed-reminder-${reminder.id}` });
            alert.onclick = () => { window.focus(); window.location.assign(reminder.href); alert.close(); };
          } catch { /* Browser delivery can fail; the durable in-app reminder remains available. */ }
        }
        if (data.reminders?.length) window.dispatchEvent(new Event("workspace:notifications-updated"));
      } catch { /* Retry temporary failures on the next poll. */ }
      finally { inFlight = false; }
    }
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    window.addEventListener("focus", check);
    window.addEventListener("workspace:reminders-enabled", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true; window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("workspace:reminders-enabled", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return null;
}
