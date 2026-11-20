import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import { USER_IDENTITY_SELECT, withAvatarUrl } from "@/lib/user-avatar";
import { companyTaskRepeatSelect, serializeTaskRepeat } from "@/lib/company-task-repeat";
import { ensureDailyCompanyTasks } from "@/services/recurring-company-tasks";

export async function getEmployeeWorkspaceData(userId: string) {
  await ensureDailyCompanyTasks();
  const where = { projectId: COMPANY_TASK_PROJECT_ID, deletedAt: null, archivedAt: null, assigneeId: userId };
  const [tasks, feedback, profile] = await Promise.all([
    prisma.task.findMany({ where, select: {
      ...companyTaskRepeatSelect,
      id: true, title: true, description: true, status: true, priority: true, startDate: true, dueDate: true, createdAt: true, updatedAt: true,
      assignee: { select: USER_IDENTITY_SELECT },
      createdById: true,
      createdBy: { select: { id: true, name: true, email: true, role: true } },
      archivedAt: true,
      assignedBy: { select: { id: true, name: true, email: true } },
      checklistItems: { orderBy: { position: "asc" }, select: { id: true, title: true, isCompleted: true, position: true } },
    }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] }),
    prisma.taskReview.findMany({ where: { submission: { submittedById: userId, task: { projectId: COMPANY_TASK_PROJECT_ID, deletedAt: null } } }, orderBy: { createdAt: "desc" }, select: {
      id: true, decision: true, feedback: true, rating: true, createdAt: true,
      reviewer: { select: USER_IDENTITY_SELECT }, submission: { select: { createdAt: true, task: { select: { id: true, title: true } } } },
    } }),
    prisma.employeeProfile.findUnique({ where: { userId }, select: { designation: true, department: { select: { name: true } } } }),
  ]);
  return {
    tasks: tasks.map(task => ({ ...serializeTaskRepeat(task), assignee: task.assignee ? withAvatarUrl(task.assignee) : null })),
    feedback: feedback.map(review => ({ ...review, reviewer: withAvatarUrl(review.reviewer) })),
    profile,
  };
}
