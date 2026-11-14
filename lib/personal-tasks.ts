export type PersonalList = { id: string; name: string; isInbox: boolean; ownerId: string; _count?: { tasks: number } };
export type PersonalStep = { id: string; title: string; isCompleted: boolean };
export type PersonalTask = {
  id: string; title: string; note: string | null; isCompleted: boolean; important: boolean;
  dueDate: string | null; reminderAt: string | null; myDayDate: string | null;
  repeat: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | null;
  createdAt: string; updatedAt: string; listId: string;
  list: { id: string; name: string; ownerId: string }; steps: PersonalStep[];
};
export type PersonalSection = "dashboard" | "tasks" | "my-day" | "important" | "calendar" | "lists" | "reports";
export const repeatLabels = { DAILY: "Every day", WEEKLY: "Every week", MONTHLY: "Every month", YEARLY: "Every year" };

export function personalSection(value: string | null): PersonalSection {
  return ["tasks", "my-day", "important", "calendar", "lists", "reports"].includes(value ?? "") ? value as PersonalSection : "dashboard";
}

export function personalSummary(tasks: readonly PersonalTask[], today: string) {
  const active = tasks.filter(task => !task.isCompleted);
  return {
    total: tasks.length, active: active.length, completed: tasks.length - active.length,
    important: active.filter(task => task.important).length,
    myDay: active.filter(task => task.myDayDate?.slice(0, 10) === today).length,
    overdue: active.filter(task => task.dueDate && task.dueDate.slice(0, 10) < today).length,
    planned: active.filter(task => task.dueDate).length,
  };
}

export function filterPersonalTasks(tasks: readonly PersonalTask[], params: URLSearchParams, today: string) {
  const section = personalSection(params.get("section"));
  const query = params.get("q")?.trim().toLowerCase();
  const filtered = tasks.filter(task => {
    if (section === "my-day" && task.myDayDate?.slice(0, 10) !== today) return false;
    if (section === "important" && !task.important) return false;
    if (query && !`${task.title} ${task.note ?? ""} ${task.list.name}`.toLowerCase().includes(query)) return false;
    if (params.get("list") && task.listId !== params.get("list")) return false;
    if (params.get("status") === "active" && task.isCompleted) return false;
    if (params.get("status") === "completed" && !task.isCompleted) return false;
    if (params.get("importance") === "important" && !task.important) return false;
    if (params.get("importance") === "normal" && task.important) return false;
    const due = task.dueDate?.slice(0, 10);
    if (params.get("due") === "overdue" && (!due || due >= today || task.isCompleted)) return false;
    if (params.get("due") === "today" && due !== today) return false;
    if (params.get("due") === "planned" && !due) return false;
    if (params.get("due") === "none" && due) return false;
    return true;
  });
  return filtered.sort((a, b) => {
    if (params.get("sort") === "title") return a.title.localeCompare(b.title);
    if (params.get("sort") === "updated") return b.updatedAt.localeCompare(a.updatedAt);
    if (params.get("sort") === "important" && a.important !== b.important) return a.important ? -1 : 1;
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || b.createdAt.localeCompare(a.createdAt);
  });
}
