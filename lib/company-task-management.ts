import type { prisma } from "@/lib/prisma";

type TaskDetails = { title?: string; description?: string | null; startDate?: Date | null; dueDate?: Date | null };

export function validateCompanyTaskDateRange(startDate: Date | null | undefined, endDate: Date | null | undefined): string | null {
  if (!startDate || !endDate) return "Choose both a start date and an end date.";
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "Choose valid start and end dates.";
  if (startDate.getTime() > endDate.getTime()) return "The end date must be on or after the start date.";
  return null;
}

export function canEditOwnCompanyTask(userId: string | undefined, task: { assignedById?: string | null; assigneeId?: string | null }) {
  return !!userId && task.assignedById === userId && task.assigneeId === userId;
}

export function validateCompanyTaskUpdateFields(role: string, fields: string[], ownsTask = false):
  { ok: true } | { ok: false; status: 400 | 403; error: string } {
  const administratorFields = ["title", "description", "startDate", "dueDate", "priority", "assigneeId"];
  if (role !== "ADMIN" && fields.some((field) => administratorFields.includes(field) && (!ownsTask || field === "assigneeId"))) {
    return { ok: false, status: 403, error: "You can only edit details of tasks you created for yourself. Only administrators can change assignments." };
  }
  const allowedFields = role === "ADMIN"
    ? [...administratorFields, "status", "notes"]
    : [...(ownsTask ? administratorFields.filter(field => field !== "assigneeId") : []), "status", "notes", "action"];
  if (fields.some((field) => !allowedFields.includes(field))) {
    return { ok: false, status: 400, error: "Unsupported task update." };
  }
  return { ok: true };
}

export function parseCompanyTaskDetails(payload: Record<string, unknown>):
  { ok: true; data: TaskDetails } | { ok: false; error: string } {
  const data: TaskDetails = {};
  if ("title" in payload) {
    if (typeof payload.title !== "string" || payload.title.trim().length < 2 || payload.title.trim().length > 200) {
      return { ok: false, error: "Task title must be between 2 and 200 characters." };
    }
    data.title = payload.title.trim();
  }
  if ("description" in payload) {
    if (payload.description !== null && (typeof payload.description !== "string" || payload.description.trim().length > 2000)) {
      return { ok: false, error: "Task description must be 2000 characters or fewer." };
    }
    data.description = typeof payload.description === "string" ? payload.description.trim() || null : null;
  }
  for (const field of ["startDate", "dueDate"] as const) {
    if (!(field in payload)) continue;
    const value = payload[field];
    if (value === null || value === "") {
      data[field] = null;
    } else {
      if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) {
        return { ok: false, error: `Enter a valid ${field === "startDate" ? "start" : "end"} date.` };
      }
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        return { ok: false, error: `Enter a valid ${field === "startDate" ? "start" : "end"} date.` };
      }
      data[field] = date;
    }
  }
  return { ok: true, data };
}

type TaskActor = { id: string; role: string; name: string | null; email: string };
type TaskDeleteStore = Pick<typeof prisma, "task" | "comment" | "taskLabel" | "activity" | "notification">;

// Run inside a transaction: restrictive relations are removed explicitly, while
// checklist items, status history, submissions and reviews cascade from Task.
export async function deleteManagedCompanyTask(
  transaction: TaskDeleteStore,
  actor: TaskActor | null,
  taskId: string,
  projectId: string,
) {
  if (!actor) return { ok: false, status: 401, error: "Unauthorized." };
  if (actor.role !== "ADMIN") return { ok: false, status: 403, error: "Administrator access is required to delete tasks." };
  const task = await transaction.task.findFirst({
    where: { id: taskId, projectId },
    select: { id: true, title: true, assigneeId: true },
  });
  if (!task) return { ok: false, status: 404, error: "Task not found." };

  await transaction.comment.deleteMany({ where: { taskId: task.id } });
  await transaction.taskLabel.deleteMany({ where: { taskId: task.id } });
  await transaction.activity.deleteMany({ where: { taskId: task.id } });
  await transaction.notification.deleteMany({ where: { taskId: task.id } });
  await transaction.task.delete({ where: { id: task.id, projectId } });

  if (task.assigneeId && task.assigneeId !== actor.id) {
    await transaction.notification.create({
      data: {
        userId: task.assigneeId,
        actorId: actor.id,
        projectId,
        type: "TASK_UNASSIGNED",
        message: `${actor.name || actor.email} deleted "${task.title}"`,
        href: "/company-tasks",
      },
    });
  }
  return { ok: true, status: 200 };
}
