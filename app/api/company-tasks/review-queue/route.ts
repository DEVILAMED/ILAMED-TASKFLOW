import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
    return NextResponse.json({ ok: false, error: "Manager access is required." }, { status: 403 });
  }
  const managedTeams = user.role === UserRole.MANAGER
    ? await prisma.teamMembership.findMany({ where: { userId: user.id, role: "MANAGER" }, select: { teamId: true } })
    : [];
  const tasks = await prisma.task.findMany({
    where: {
      projectId: COMPANY_TASK_PROJECT_ID,
      status: "SUBMITTED_FOR_REVIEW",
      ...(user.role === UserRole.MANAGER
        ? { assignee: { is: { teamMemberships: { some: { teamId: { in: managedTeams.map((team) => team.teamId) } } } } } }
        : {}),
    },
    orderBy: [{ dueDate: "asc" }, { updatedAt: "asc" }],
    select: {
      id: true, title: true, description: true, dueDate: true,
      assignee: { select: { id: true, name: true, email: true } },
      submissions: { orderBy: { createdAt: "desc" }, take: 1, select: {
        id: true, notes: true, createdAt: true, submittedBy: { select: { name: true, email: true } },
      } },
    },
  });
  return NextResponse.json({ ok: true, tasks: tasks.map((task) => ({
    ...task, dueDate: task.dueDate?.toISOString() ?? null,
    submission: task.submissions[0] ? {
      ...task.submissions[0], createdAt: task.submissions[0].createdAt.toISOString(),
      submitter: task.submissions[0].submittedBy.name || task.submissions[0].submittedBy.email,
    } : null,
  })) });
}
