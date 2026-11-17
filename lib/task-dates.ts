type DateValue = Date | string | null | undefined;
type ScheduledTask = { startDate?: DateValue; dueDate: DateValue };

export function taskDateKey(value: DateValue): string | null {
  if (!value) return null;
  if (value instanceof Date && Number.isNaN(value.getTime())) return null;
  const key = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key ? key : null;
}

export function taskOverlapsDateRange(task: ScheduledTask, from: string, to: string): boolean {
  const start = taskDateKey(task.startDate) || taskDateKey(task.dueDate);
  const end = taskDateKey(task.dueDate) || taskDateKey(task.startDate);
  return Boolean(start && end && start <= end && from <= to && start <= to && end >= from);
}

export function taskIsScheduledOn(task: ScheduledTask, day: string): boolean {
  return taskOverlapsDateRange(task, day, day);
}

export function formatTaskDateRange(startDate: DateValue, endDate: DateValue): string {
  const start = taskDateKey(startDate);
  const end = taskDateKey(endDate);
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const date = (key: string) => new Date(`${key}T00:00:00.000Z`);
  if (start && end && start <= end) return formatter.formatRange(date(start), date(end));
  if (end) return `Until ${formatter.format(date(end))}`;
  if (start) return `From ${formatter.format(date(start))}`;
  return "Not scheduled";
}
