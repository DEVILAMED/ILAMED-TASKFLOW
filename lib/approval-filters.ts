import { employeeDayKey } from "./company-workdays.ts";
import { taskDateKey } from "./task-dates.ts";

type ApprovalItem = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  assignee: { id: string; name: string | null; email: string } | null;
  submission: { createdAt: string; submitter: string; notes: string | null } | null;
};

export function readApprovalFilters(params: Pick<URLSearchParams, "get">) {
  const date = (key: string) => {
    const value = params.get(key) ?? "";
    return taskDateKey(value) === value ? value : "";
  };
  return {
    query: params.get("q") ?? "",
    user: params.get("user") ?? "",
    dateField: params.get("date") === "due" ? "due" : "submitted",
    from: date("from"),
    to: date("to"),
    sort: ["newest", "oldest"].includes(params.get("sort") ?? "") ? params.get("sort")! : "queue",
    task: params.get("task") ?? "",
  };
}

export function filterApprovals<T extends ApprovalItem>(tasks: readonly T[], filters: ReturnType<typeof readApprovalFilters>): T[] {
  if (filters.from && filters.to && filters.from > filters.to) return [];
  const query = filters.query.trim().toLocaleLowerCase();
  const result = tasks.filter(task => {
    if (filters.task && task.id !== filters.task) return false;
    if (filters.user && task.assignee?.id !== filters.user) return false;
    if (query && ![task.title, task.description, task.assignee?.name, task.assignee?.email, task.submission?.submitter, task.submission?.notes]
      .some(value => value?.toLocaleLowerCase().includes(query))) return false;
    if (!filters.from && !filters.to) return true;
    const submittedAt = task.submission ? new Date(task.submission.createdAt) : null;
    const day = filters.dateField === "due" ? taskDateKey(task.dueDate)
      : submittedAt && !Number.isNaN(submittedAt.getTime()) ? employeeDayKey(submittedAt) : null;
    return Boolean(day && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to));
  });
  if (filters.sort !== "queue") {
    const timestamp = (task: T) => task.submission ? Date.parse(task.submission.createdAt) : NaN;
    result.sort((a, b) => {
      const first = timestamp(a), second = timestamp(b);
      if (!Number.isFinite(first)) return Number.isFinite(second) ? 1 : 0;
      if (!Number.isFinite(second)) return -1;
      return filters.sort === "oldest" ? first - second : second - first;
    });
  }
  return result;
}
