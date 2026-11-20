import { ensureDailyCompanyTasks } from "@/services/recurring-company-tasks";
import { dispatchCompanyTaskDigests } from "@/services/company-task-reminders";

const worker = globalThis as typeof globalThis & { companyTaskTimer?: ReturnType<typeof setTimeout> };
export function startCompanyTaskWorker() {
  if (worker.companyTaskTimer) return;
  const schedule = () => {
    worker.companyTaskTimer = setTimeout(async () => {
      try { await ensureDailyCompanyTasks(); await dispatchCompanyTaskDigests(); }
      catch (error) { console.error("Company task maintenance failed; retrying on the next sweep.", error); }
      finally { schedule(); }
    }, 60_000);
    worker.companyTaskTimer.unref();
  };
  schedule();
}
