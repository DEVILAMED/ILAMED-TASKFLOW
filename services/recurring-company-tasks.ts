import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { employeeDayKey, isCompanyWorkday } from "@/lib/company-workdays";
import { nextCalendarDay } from "@/lib/company-task-repeat";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

// Each request checks a persisted cursor. The conditional update locks the rule
// so concurrent requests and app instances cannot generate the same day twice.
export async function ensureDailyCompanyTasks(now = new Date()) {
  const today = employeeDayKey(now);
  const todayDate = new Date(`${today}T00:00:00Z`);
  const rules = await prisma.companyTaskRecurrence.findMany({
    where: { projectId: COMPANY_TASK_PROJECT_ID, isActive: true, nextDate: { lte: todayDate }, assignee: {
      isBlocked: false, role: { not: "ADMIN" }, OR: [{ employeeProfile: null }, { employeeProfile: { employmentStatus: { not: "INACTIVE" } } }],
    } },
    orderBy: { nextDate: "asc" },
  });
  for (const rule of rules) {
    if (!rule.assigneeId) continue;
    const until = rule.endDate && rule.endDate < todayDate ? rule.endDate : todayDate;
    const end = until.toISOString().slice(0, 10);
    const leave = await prisma.employeeLeaveDay.findMany({ where: { employeeId: rule.assigneeId, day: { gte: rule.nextDate, lte: until } }, select: { day: true } });
    const leaveDays = leave.map(item => item.day.toISOString().slice(0, 10));
    const days: string[] = [];
    for (let day = rule.nextDate.toISOString().slice(0, 10); day <= end; day = nextCalendarDay(day)) {
      if (isCompanyWorkday(day, leaveDays)) days.push(day);
    }
    await prisma.$transaction(async tx => {
      const claimed = await tx.companyTaskRecurrence.updateMany({
        where: { id: rule.id, isActive: true, nextDate: rule.nextDate },
        data: { nextDate: new Date(`${nextCalendarDay(end)}T00:00:00Z`), ...(rule.endDate && rule.endDate <= todayDate ? { isActive: false } : {}) },
      });
      if (!claimed.count || !days.length) return;
      const occurrences = days.map(day => ({
        id: randomUUID(), title: rule.title, description: rule.description, priority: rule.priority, status: "TODO" as const,
        projectId: rule.projectId, assigneeId: rule.assigneeId, assignedById: rule.createdById, recurrenceId: rule.id,
        recurrenceDate: new Date(`${day}T00:00:00Z`), startDate: new Date(`${day}T00:00:00Z`), dueDate: new Date(`${day}T00:00:00Z`),
      }));
      await tx.task.createMany({ data: occurrences });
      const checklist = Array.isArray(rule.checklistItems) ? rule.checklistItems.filter((item): item is string => typeof item === "string") : [];
      if (checklist.length) await tx.companyTaskChecklistItem.createMany({ data: occurrences.flatMap(task => checklist.map((title, position) => ({ taskId: task.id, title, position, isCompleted: false }))) });
      await tx.taskStatusHistory.createMany({ data: occurrences.map(task => ({ taskId: task.id, actorId: rule.createdById ?? rule.assigneeId!, fromStatus: null, toStatus: "TODO" })) });
      await tx.notification.createMany({ data: occurrences.map(task => ({
        userId: rule.assigneeId!, actorId: rule.createdById, projectId: rule.projectId, taskId: task.id,
        type: "TASK_COMMENTED", message: `Daily submission ready for ${task.recurrenceDate.toISOString().slice(0, 10)}: "${rule.title}"`, href: `/company-tasks?task=${task.id}`,
      })) });
    }, { timeout: 30_000 });
  }
}
