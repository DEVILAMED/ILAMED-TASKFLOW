import { isCompanyTaskOverdue, type LeaveDaysByEmployee } from "./company-workdays.ts";
import { companyTaskSnapshot } from "./company-task-series.ts";

export { employeeDayKey } from "./company-workdays.ts";

type Task = { id?: string; recurrenceId?: string | null; recurrenceDate?: Date | string | null; recurrence?: { isActive: boolean; endDate: Date | string | null } | null; status: string; startDate?: Date | string | null; dueDate: Date | string | null; assigneeId?: string | null };
const terminal = new Set(["APPROVED", "DONE", "CANCELLED", "REJECTED"]);

export function summarizeEmployeeWork(taskRows: readonly Task[], today: string, leaveByEmployee: LeaveDaysByEmployee = {}) {
  const tasks = companyTaskSnapshot(taskRows, today);
  const completed = tasks.filter(task => task.status === "APPROVED" || task.status === "DONE").length;
  return {
    assigned: tasks.length,
    completed,
    pending: tasks.filter(task => !terminal.has(task.status)).length,
    inProgress: tasks.filter(task => task.status === "IN_PROGRESS").length,
    awaiting: tasks.filter(task => task.status === "SUBMITTED_FOR_REVIEW").length,
    overdue: tasks.filter(task => isCompanyTaskOverdue(task, today, leaveByEmployee)).length,
    completionRate: tasks.length ? Math.round(completed / tasks.length * 100) : null,
  };
}
