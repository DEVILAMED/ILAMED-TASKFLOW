export type TaskEvidence = {
  title: string; description?: string | null; priority?: string;
  startDate?: Date | string | null; dueDate?: Date | string | null;
  assigneeId?: string | null; createdById?: string | null;
  assignee?: { name: string | null; email: string } | null;
  checklistItems?: readonly { title: string; isCompleted: boolean }[];
};

export function taskEvidenceSnapshot(task: TaskEvidence) {
  const date = (value: Date | string | null | undefined) => value instanceof Date ? value.toISOString() : value ?? null;
  return {
    title: task.title, description: task.description ?? null, priority: task.priority ?? null,
    startDate: date(task.startDate), dueDate: date(task.dueDate), assigneeId: task.assigneeId ?? null,
    createdById: task.createdById ?? null,
    assigneeName: task.assignee ? task.assignee.name || task.assignee.email : null,
    checklist: (task.checklistItems ?? []).map(item => ({ title: item.title, isCompleted: item.isCompleted })),
  };
}

export type TaskEvidenceSnapshot = ReturnType<typeof taskEvidenceSnapshot>;

export function describeTaskEvidence(value: unknown) {
  if (!value || typeof value !== "object") return "Not recorded";
  const data = value as Record<string, unknown>;
  const fields: Record<string, string> = { title: "Title", description: "Instructions", priority: "Priority", startDate: "Start date", dueDate: "End date", assigneeId: "Assigned to", checklist: "Checklist", archivedAt: "Archived", deletedAt: "In recycle bin", isCompleted: "Step completed" };
  return Object.entries(data).filter(([key]) => key in fields).map(([key, item]) => {
    let content: string;
    if (key === "assigneeId") content = item ? String(data.assigneeName || "Employee not recorded") : "Unassigned";
    else if (key === "deletedAt" || key === "archivedAt") content = item ? "Yes" : "No";
    else if (key === "checklist" && Array.isArray(item)) content = item.map(step => `${step.isCompleted ? "Done" : "Pending"}: ${step.title}`).join("; ") || "No checklist";
    else if (typeof item === "boolean") content = item ? "Yes" : "No";
    else content = item == null || item === "" ? "Not set" : String(item);
    return `${fields[key]}: ${content}`;
  }).join("\n");
}

export function readTaskEvidenceSnapshot(value: unknown): TaskEvidenceSnapshot | null {
  if (!value || typeof value !== "object" || !("title" in value) || typeof value.title !== "string") return null;
  const data = value as Record<string, unknown>;
  const string = (key: string) => typeof data[key] === "string" ? data[key] as string : null;
  return { title: value.title, description: string("description"), priority: string("priority"), startDate: string("startDate"), dueDate: string("dueDate"), assigneeId: string("assigneeId"), createdById: string("createdById"), assigneeName: string("assigneeName"), checklist: Array.isArray(data.checklist) ? data.checklist.filter(item => item && typeof item.title === "string" && typeof item.isCompleted === "boolean").map(item => ({ title: item.title as string, isCompleted: item.isCompleted as boolean })) : [] };
}
