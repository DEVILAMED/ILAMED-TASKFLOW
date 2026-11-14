import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

export async function getEmployeeWorkspaceData(userId: string) {
  const where = { projectId: COMPANY_TASK_PROJECT_ID, assigneeId: userId };
  const [tasks, feedback, profile] = await Promise.all([
    prisma.task.findMany({ where, select: {
      id: true, title: true, description: true, status: true, priority: true, dueDate: true, createdAt: true, updatedAt: true,
      assignee: { select: { id: true, name: true, email: true } },
      checklistItems: { orderBy: { position: "asc" }, select: { id: true, title: true, isCompleted: true, position: true } },
    }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] }),
    prisma.taskReview.findMany({ where: { submission: { task: where } }, orderBy: { createdAt: "desc" }, select: {
      id: true, decision: true, feedback: true, rating: true, createdAt: true,
      reviewer: { select: { name: true, email: true } }, submission: { select: { task: { select: { id: true, title: true } } } },
    } }),
    prisma.employeeProfile.findUnique({ where: { userId }, select: { designation: true, department: { select: { name: true } } } }),
  ]);
  return { tasks, feedback, profile };
}
