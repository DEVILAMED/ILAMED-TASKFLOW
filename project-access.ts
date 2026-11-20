import type { Prisma } from "@prisma/client";
import { COMPANY_TASK_PROJECT_ID } from "./lib/company-task-constants.ts";

export function accessibleProjectWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      {
        ownerId: userId,
      },
      {
        members: {
          some: {
            userId,
          },
        },
      },
      {
        team: {
          memberships: {
            some: {
              userId,
            },
          },
        },
      },
    ],
  };
}

export function accessibleTaskWhere(userId: string): Prisma.TaskWhereInput {
  return {
    deletedAt: null,
    // Company tasks use their own role and ownership rules and lifecycle routes.
    projectId: { not: COMPANY_TASK_PROJECT_ID },
    AND: [
      {
        project: accessibleProjectWhere(userId),
      },
      {
        OR: [
          { assigneeId: userId },
          { assigneeId: null },
          { project: { ownerId: userId } },
          { project: { members: { some: { userId } } } },
          {
            project: {
              team: {
                memberships: {
                  some: {
                    userId,
                    role: "MANAGER",
                  },
                },
              },
            },
          },
        ],
      },
    ],
  };
}
