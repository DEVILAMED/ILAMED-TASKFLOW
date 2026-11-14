import type { AuthUser } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

export async function companyReportingScope(user: AuthUser): Promise<Prisma.TaskWhereInput> {
  if (user.role === "ADMIN") return { projectId: COMPANY_TASK_PROJECT_ID };
  const memberships = user.role === "MANAGER" ? await prisma.teamMembership.findMany({ where: { userId: user.id, role: "MANAGER" }, select: { teamId: true } }) : [];
  const members = memberships.length ? await prisma.teamMembership.findMany({ where: { teamId: { in: memberships.map(item => item.teamId) } }, select: { userId: true } }) : [];
  return { projectId: COMPANY_TASK_PROJECT_ID, assigneeId: { in: [...new Set([user.id, ...members.map(member => member.userId)])] } };
}
