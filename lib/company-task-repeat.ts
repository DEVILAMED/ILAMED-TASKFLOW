import { isCompanyWorkday } from "./company-workdays.ts";
import { taskDateKey } from "./task-dates.ts";

export type CompanyTaskRepeatInfo = {
  recurrenceId?: string | null;
  recurrenceDate?: string | null;
  recurrence?: { isActive: boolean; startDate: string; endDate: string | null } | null;
};

export const companyTaskRepeatSelect = {
  recurrenceId: true,
  recurrenceDate: true,
  recurrence: { select: { isActive: true, startDate: true, endDate: true } },
} as const;

export function nextCalendarDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export function firstRepeatWorkday(start: string, end: string | null, leaveDays: readonly string[]): string | null {
  let day = start;
  while (!isCompanyWorkday(day, leaveDays)) {
    day = nextCalendarDay(day);
    if (end && day > end) return null;
  }
  return !end || day <= end ? day : null;
}

export function parseTaskRepeat(payload: Record<string, unknown>):
  { ok: true; daily: boolean; endDate: Date | null } | { ok: false; error: string } {
  if (payload.repeat !== undefined && payload.repeat !== "NONE" && payload.repeat !== "DAILY") {
    return { ok: false, error: "Choose no repeat or daily repeat." };
  }
  const daily = payload.repeat === "DAILY";
  if (payload.repeatUntil === undefined || payload.repeatUntil === null || payload.repeatUntil === "") return { ok: true, daily, endDate: null };
  if (!daily || typeof payload.repeatUntil !== "string" || taskDateKey(payload.repeatUntil) !== payload.repeatUntil) {
    return { ok: false, error: "Choose a valid last date for daily repeat." };
  }
  return { ok: true, daily, endDate: new Date(`${payload.repeatUntil}T00:00:00Z`) };
}

export function serializeTaskRepeat<T extends { recurrenceDate?: Date | null; recurrence?: { isActive: boolean; startDate: Date; endDate: Date | null } | null }>(task: T) {
  return {
    ...task,
    recurrenceDate: task.recurrenceDate?.toISOString() ?? null,
    recurrence: task.recurrence ? { ...task.recurrence, startDate: task.recurrence.startDate.toISOString(), endDate: task.recurrence.endDate?.toISOString() ?? null } : null,
  };
}
