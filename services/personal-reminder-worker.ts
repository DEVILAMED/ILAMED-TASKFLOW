import { dispatchPersonalTaskReminders } from "@/services/personal-task-reminders";

const worker = globalThis as typeof globalThis & { personalReminderTimer?: ReturnType<typeof setTimeout> };

export function startPersonalReminderWorker() {
  if (worker.personalReminderTimer) return;
  // Schedule the next sweep after completion so slow database calls cannot overlap.
  const schedule = () => {
    worker.personalReminderTimer = setTimeout(async () => {
      try { await dispatchPersonalTaskReminders(); }
      catch (error) { console.error("Personal reminder processing failed; retrying on the next sweep.", error); }
      finally { schedule(); }
    }, 30_000);
    worker.personalReminderTimer.unref();
  };
  schedule();
}
