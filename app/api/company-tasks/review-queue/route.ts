import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import { submissionImageSelect, submissionImageUrl } from "@/lib/submission-images";
import { USER_IDENTITY_SELECT, userAvatarUrl, withAvatarUrl } from "@/lib/user-avatar";

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
      id: true, title: true, description: true, dueDate: true, recurrenceDate: true,
      assignee: { select: USER_IDENTITY_SELECT },
      submissions: { orderBy: { createdAt: "desc" }, take: 1, select: {
        id: true, notes: true, createdAt: true, submittedBy: { select: USER_IDENTITY_SELECT },
        images: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: submissionImageSelect },
      } },
    },
  });
  return NextResponse.json({ ok: true, tasks: tasks.map((task) => ({
    id: task.id, title: task.title, description: task.description, assignee: task.assignee ? withAvatarUrl(task.assignee) : null,
    dueDate: task.dueDate?.toISOString() ?? null,
    recurrenceDate: task.recurrenceDate?.toISOString() ?? null,
    submission: task.submissions[0] ? {
      id: task.submissions[0].id, notes: task.submissions[0].notes, createdAt: task.submissions[0].createdAt.toISOString(),
      submitter: task.submissions[0].submittedBy.name || task.submissions[0].submittedBy.email,
      submitterAvatarUrl: userAvatarUrl(task.submissions[0].submittedBy.id, task.submissions[0].submittedBy.avatar),
      images: task.submissions[0].images.map((image) => ({ ...image, url: submissionImageUrl(task.id, task.submissions[0].id, image.id) })),
    } : null,
  })) });
}
