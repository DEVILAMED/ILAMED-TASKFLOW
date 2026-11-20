import type { AuthUser } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

export async function companyReportingEmployeeIds(user: AuthUser): Promise<string[] | undefined> {
  if (user.role === "ADMIN") return undefined;
  const memberships = user.role === "MANAGER" ? await prisma.teamMembership.findMany({ where: { userId: user.id, role: "MANAGER" }, select: { teamId: true } }) : [];
  const members = memberships.length ? await prisma.teamMembership.findMany({ where: { teamId: { in: memberships.map(item => item.teamId) } }, select: { userId: true } }) : [];
  return [...new Set([user.id, ...members.map(member => member.userId)])];
}

export async function companyReportingScope(user: AuthUser): Promise<Prisma.TaskWhereInput> {
  const employeeIds = await companyReportingEmployeeIds(user);
  return { projectId: COMPANY_TASK_PROJECT_ID, deletedAt: null, archivedAt: null, ...(employeeIds === undefined ? {} : { assigneeId: { in: employeeIds } }) };
}
