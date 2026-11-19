import { prisma } from "@/lib/prisma";
import { accessibleTodoListWhere } from "@/lib/todo-access";

// Persist reminders independently of browser permission. The task claim and
// notifications commit together; unique receipts also protect retries/reschedules.
export async function dispatchPersonalTaskReminders(userId?: string, now = new Date()) {
  const tasks = await prisma.todoTask.findMany({
    where: {
      isCompleted: false, reminderProcessedAt: null, reminderAt: { lte: now },
      ...(userId ? { list: accessibleTodoListWhere(userId) } : {}),
    },
    orderBy: [{ reminderAt: "asc" }, { id: "asc" }], take: 100,
    select: { id: true, reminderAt: true },
  });
  for (const task of tasks) {
    await prisma.$transaction(async tx => {
      const claimed = await tx.todoTask.updateMany({
        where: { id: task.id, isCompleted: false, reminderProcessedAt: null, reminderAt: task.reminderAt },
        data: { reminderProcessedAt: now },
      });
      if (!claimed.count) return;
      const current = await tx.todoTask.findUniqueOrThrow({
        where: { id: task.id },
        select: {
          title: true,
          list: { select: {
            owner: { select: { id: true, isBlocked: true } },
            memberships: { select: { user: { select: { id: true, isBlocked: true } } } },
          } },
        },
      });
      const recipients = [current.list.owner, ...current.list.memberships.map(member => member.user)]
        .filter(person => !person.isBlocked);
      const userIds = [...new Set(recipients.map(person => person.id))];
      if (userIds.length) await tx.notification.createMany({
        data: userIds.map(id => ({
          userId: id, type: "PERSONAL_TASK_REMINDER" as const,
          message: `Reminder: ${current.title}`, href: `/todos?section=tasks&task=${encodeURIComponent(task.id)}`,
          todoTaskId: task.id, reminderAt: task.reminderAt,
        })),
        skipDuplicates: true,
      });
    });
  }
}

// A conditional database update makes desktop delivery at most once across
// tabs, reloads and devices. The in-app notification remains until read.
export async function claimPersonalTaskReminders(userId: string, now = new Date()) {
  const where = {
    userId, type: "PERSONAL_TASK_REMINDER" as const, desktopClaimedAt: null, readAt: null,
    todoTask: { is: { isCompleted: false, list: accessibleTodoListWhere(userId) } },
  };
  const pending = await prisma.notification.findMany({
    where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 10,
    select: { id: true, message: true, href: true },
  });
  const reminders: typeof pending = [];
  for (const reminder of pending) {
    const claimed = await prisma.notification.updateMany({
      where: { ...where, id: reminder.id }, data: { desktopClaimedAt: now },
    });
    if (claimed.count) reminders.push(reminder);
  }
  return reminders;
}
