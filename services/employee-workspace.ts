import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import { USER_IDENTITY_SELECT, withAvatarUrl } from "@/lib/user-avatar";

export async function getEmployeeWorkspaceData(userId: string) {
  const where = { projectId: COMPANY_TASK_PROJECT_ID, assigneeId: userId };
  const [tasks, feedback, profile] = await Promise.all([
    prisma.task.findMany({ where, select: {
      id: true, title: true, description: true, status: true, priority: true, startDate: true, dueDate: true, createdAt: true, updatedAt: true,
      assignee: { select: USER_IDENTITY_SELECT },
      checklistItems: { orderBy: { position: "asc" }, select: { id: true, title: true, isCompleted: true, position: true } },
    }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] }),
    prisma.taskReview.findMany({ where: { submission: { submittedById: userId, task: { projectId: COMPANY_TASK_PROJECT_ID } } }, orderBy: { createdAt: "desc" }, select: {
      id: true, decision: true, feedback: true, rating: true, createdAt: true,
      reviewer: { select: USER_IDENTITY_SELECT }, submission: { select: { createdAt: true, task: { select: { id: true, title: true } } } },
    } }),
    prisma.employeeProfile.findUnique({ where: { userId }, select: { designation: true, department: { select: { name: true } } } }),
  ]);
  return {
    tasks: tasks.map(task => ({ ...task, assignee: task.assignee ? withAvatarUrl(task.assignee) : null })),
    feedback: feedback.map(review => ({ ...review, reviewer: withAvatarUrl(review.reviewer) })),
    profile,
  };
}
