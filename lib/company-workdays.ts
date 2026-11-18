import { formatTaskDateRange, taskDateKey, taskOverlapsDateRange } from "./task-dates.ts";

export type LeaveDaysByEmployee = Record<string, readonly string[]>;
type ScheduledWork = { startDate?: Date | string | null; dueDate: Date | string | null };
type AssignedWork = ScheduledWork & { assigneeId?: string | null };
type CompanySchedule = { startDate: string | null; dueDate: string | null; workingDays: number | null };
const DAY_MS = 86_400_000;
const NONE: readonly string[] = [];
const dayNumber = (day: string) => Date.parse(day + "T00:00:00Z") / DAY_MS;
const dayKey = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const sunday = (day: number) => (day + 4) % 7 === 0;
const indiaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

export function employeeDayKey(date = new Date()) {
  return indiaDate.format(date);
}

export function isSunday(day: string) {
  return sunday(dayNumber(day));
}

export function isCompanyWorkday(day: string, leaveDays: readonly string[] = NONE) {
  return taskDateKey(day) === day && !isSunday(day) && !leaveDays.includes(day);
}

export function countCompanyWorkdays(from: string, to: string, leaveDays: readonly string[] = NONE) {
  if (taskDateKey(from) !== from || taskDateKey(to) !== to || to < from) return 0;
  const start = dayNumber(from), end = dayNumber(to);
  const firstSunday = start + (((-start - 4) % 7 + 7) % 7);
  const sundays = firstSunday > end ? 0 : 1 + Math.floor((end - firstSunday) / 7);
  const leaveCount = new Set(leaveDays.filter(day => day >= from && day <= to && taskDateKey(day) === day && !isSunday(day))).size;
  return end - start + 1 - sundays - leaveCount;
}

export function employeeLeaveDays(index: LeaveDaysByEmployee, employeeId?: string | null) {
  return employeeId && Object.hasOwn(index, employeeId) ? index[employeeId] : NONE;
}

export function companyTaskSchedule(task: ScheduledWork, leaveDays: readonly string[] = NONE): CompanySchedule {
  const start = taskDateKey(task.startDate);
  const due = taskDateKey(task.dueDate);
  if (!due) return { startDate: start, dueDate: due, workingDays: null };

  // A legacy deadline without a start date is treated as a one-day schedule.
  const first = start && start <= due ? start : due;
  let end = dayNumber(due);
  const leave = new Set(leaveDays);
  const unavailable = (day: number) => sunday(day) || leave.has(dayKey(day));
  while (sunday(end)) end++;

  // Restore each workday lost to leave, skipping holidays and any further leave.
  const plannedEnd = dayKey(end);
  let replacementDays = new Set(leaveDays.filter(day => day >= first && day <= plannedEnd && taskDateKey(day) === day && !isSunday(day))).size;
  while (replacementDays > 0) {
    end++;
    if (!unavailable(end)) replacementDays--;
  }
  const effectiveDue = dayKey(end);
  return {
    startDate: start ? first : effectiveDue,
    dueDate: effectiveDue,
    workingDays: countCompanyWorkdays(first, effectiveDue, leaveDays),
  };
}

export function companyScheduleOverlaps(schedule: ScheduledWork, from: string, to: string, leaveDays: readonly string[] = NONE) {
  if (!taskOverlapsDateRange(schedule, from, to)) return false;
  const start = taskDateKey(schedule.startDate) ?? taskDateKey(schedule.dueDate)!;
  const end = taskDateKey(schedule.dueDate) ?? start;
  return countCompanyWorkdays(from > start ? from : start, to < end ? to : end, leaveDays) > 0;
}

export function formatCompanyTaskSchedule(schedule: CompanySchedule) {
  const range = formatTaskDateRange(schedule.startDate, schedule.dueDate);
  const days = schedule.workingDays;
  return days === null ? range : `${range} · ${days} working ${days === 1 ? "day" : "days"}`;
}

export function isCompanyTaskOverdue(task: AssignedWork & { status: string }, today: string, leaveByEmployee: LeaveDaysByEmployee = {}) {
  if (["APPROVED", "DONE", "REJECTED", "CANCELLED"].includes(task.status)) return false;
  const leaveDays = employeeLeaveDays(leaveByEmployee, task.assigneeId);
  const { dueDate } = companyTaskSchedule(task, leaveDays);
  if (!dueDate || today <= dueDate) return false;
  // A task becomes overdue when a working day begins after its adjusted deadline.
  return countCompanyWorkdays(dueDate, today, leaveDays) > 1;
}
