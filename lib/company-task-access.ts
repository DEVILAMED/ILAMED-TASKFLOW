import type { Prisma } from "@prisma/client";

// Apply alongside the task id and company project id on every private read.
export function companyTaskAccessWhere(user: { id: string; role: string }): Prisma.TaskWhereInput {
  if (user.role === "ADMIN") return { deletedAt: null };
  if (user.role === "MANAGER") return {
    deletedAt: null,
    OR: [
      { assigneeId: user.id },
      { assignee: { teamMemberships: { some: { team: { memberships: { some: { userId: user.id, role: "MANAGER" } } } } } } },
    ],
  };
  return { assigneeId: user.id, deletedAt: null };
}
