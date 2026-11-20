import { employeeDayKey } from "./company-workdays.ts";
import { taskDateKey } from "./task-dates.ts";

type SeriesTask = {
  id?: string;
  status: string;
  recurrenceId?: string | null;
  recurrenceDate?: Date | string | null;
  dueDate?: Date | string | null;
  createdAt?: Date | string;
  recurrence?: { isActive: boolean; endDate: Date | string | null } | null;
};
const closed = new Set(["APPROVED", "DONE", "CANCELLED", "REJECTED"]);
const date = (task: SeriesTask) => taskDateKey(task.recurrenceDate) ?? taskDateKey(task.dueDate) ?? "";

// Daily records carry independent workflow and submission history. Their shared
// recurrence ID is the identity used for task lists and task totals.
export function groupCompanyTaskSeries<T extends SeriesTask>(tasks: readonly T[], preferredDay?: string) {
  const groups = new Map<string, T[]>();
  tasks.forEach((task, index) => {
    const key = task.recurrenceId ? `series:${task.recurrenceId}` : `task:${task.id ?? index}`;
    const entries = groups.get(key) ?? [];
    entries.push(task);
    groups.set(key, entries);
  });
  return [...groups.values()].map(entries => {
    const occurrences = entries.slice().sort((a, b) => date(a).localeCompare(date(b)));
    const task = (preferredDay ? occurrences.find(item => date(item) === preferredDay) : undefined)
      ?? occurrences.find(item => !closed.has(item.status)) ?? occurrences[occurrences.length - 1];
    return { task, occurrences };
  });
}

export function companyTaskSnapshot<T extends SeriesTask>(tasks: readonly T[], today = employeeDayKey()): T[] {
  return groupCompanyTaskSeries(tasks).map(({ task, occurrences }) => {
    if (!task.recurrenceId) return task;
    const created = occurrences.filter(item => item.createdAt).sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime())[0]?.createdAt;
    // Finishing today's submission does not complete a repeat with future work.
    const continuing = task.recurrence?.isActive && (!task.recurrence.endDate || taskDateKey(task.recurrence.endDate)! > today);
    const allApproved = occurrences.every(item => ["APPROVED", "DONE"].includes(item.status));
    const allClosed = occurrences.every(item => closed.has(item.status));
    const status = allClosed && !allApproved ? (occurrences.some(item => item.status === "REJECTED") ? "REJECTED" : "CANCELLED") : task.status;
    return { ...task, status, ...(created ? { createdAt: created } : {}), ...(continuing && allApproved ? { status: "IN_PROGRESS", dueDate: null } : {}) };
  });
}
