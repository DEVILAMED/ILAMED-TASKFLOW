import "server-only";

import { prisma } from "@/lib/prisma";
import { accessibleProjectWhere } from "@/project-access";

type ProjectSummary = {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  owner: {
    id: string;
    name: string | null;
    email: string;
  };
  role: "OWNER" | "MEMBER";
  memberCount: number;
};

export async function listProjectsForUser(
  userId: string,
): Promise<ProjectSummary[]> {
  const projects = await prisma.project.findMany({
    where: accessibleProjectWhere(userId),
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      ownerId: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      members: {
        select: {
          userId: true,
        },
      },
      team: {
        select: {
          memberships: {
            select: { userId: true },
          },
        },
      },
    },
  });

  const normalized: ProjectSummary[] = projects.map((project) => {
    const role: ProjectSummary["role"] = project.ownerId === userId ? "OWNER" : "MEMBER";

    return {
      id: project.id,
      title: project.title,
      description: project.description,
      createdAt: project.createdAt.toISOString(),
      owner: project.owner,
      role,
      memberCount: new Set([
        project.ownerId,
        ...project.members.map((member) => member.userId),
        ...(project.team?.memberships.map((member) => member.userId) ?? []),
      ]).size,
    };
  });

  return normalized;
}
