import { isCompanyTaskOverdue, type LeaveDaysByEmployee } from "./company-workdays.ts";

export { employeeDayKey } from "./company-workdays.ts";

type Task = { status: string; startDate?: Date | string | null; dueDate: Date | string | null; assigneeId?: string | null };
const terminal = new Set(["APPROVED", "DONE", "CANCELLED", "REJECTED"]);

export function summarizeEmployeeWork(tasks: readonly Task[], today: string, leaveByEmployee: LeaveDaysByEmployee = {}) {
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
