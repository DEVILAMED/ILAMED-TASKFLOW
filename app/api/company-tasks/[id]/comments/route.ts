import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import { USER_IDENTITY_SELECT, userAvatarUrl } from "@/lib/user-avatar";
import { companyTaskAccessWhere } from "@/lib/company-task-access";

type RouteContext = { params: Promise<{ id: string }> };

async function findAccessibleTask(taskId: string, user: { id: string; role: string }) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      projectId: COMPANY_TASK_PROJECT_ID,
      ...companyTaskAccessWhere(user),
    },
    select: {
      id: true,
      title: true,
      projectId: true,
      assigneeId: true,
      archivedAt: true,
    },
  });
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const task = await findAccessibleTask(id, user);
  if (!task) {
    return NextResponse.json({ ok: false, error: "Task not found or access denied." }, { status: 404 });
  }

  const comments = await prisma.comment.findMany({
    where: { taskId: task.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      content: true,
      createdAt: true,
      user: { select: USER_IDENTITY_SELECT },
    },
  });

  return NextResponse.json({
    ok: true,
    comments: comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      author: comment.user.name || comment.user.email,
      authorId: comment.user.id,
      authorAvatarUrl: userAvatarUrl(comment.user.id, comment.user.avatar),
    })),
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const task = await findAccessibleTask(id, user);
  if (!task) {
    return NextResponse.json({ ok: false, error: "Task not found or access denied." }, { status: 404 });
  }

  if (task.archivedAt) return NextResponse.json({ ok: false, error: "Unarchive this task before adding updates." }, { status: 409 });

  let payload: { content?: unknown } | null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const content = typeof payload?.content === "string" ? payload.content.trim() : "";
  if (!content || content.length > 2000) {
    return NextResponse.json({ ok: false, error: "Update must be between 1 and 2000 characters." }, { status: 400 });
  }

  const recipients = user.role === UserRole.ADMIN
    ? (task.assigneeId ? [task.assigneeId] : [])
    : await prisma.user.findMany({
        where: { role: UserRole.ADMIN, id: { not: user.id } },
        select: { id: true },
      }).then((admins) => admins.map((admin) => admin.id));
  const comment = await prisma.$transaction(async (tx) => {
    const active = await tx.task.updateMany({ where: { id: task.id, projectId: COMPANY_TASK_PROJECT_ID, ...companyTaskAccessWhere(user), assigneeId: task.assigneeId, archivedAt: null }, data: { updatedAt: new Date() } });
    if (!active.count) return null;
    const created = await tx.comment.create({
      data: { taskId: task.id, userId: user.id, content },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: { select: USER_IDENTITY_SELECT },
      },
    });

    if (recipients.length) {
      await tx.notification.createMany({
        data: recipients.map((recipientId) => ({
          userId: recipientId,
          actorId: user.id,
          projectId: task.projectId,
          taskId: task.id,
          type: "TASK_COMMENTED",
          message: `${user.name || user.email} updated "${task.title}"`,
          href: "/company-tasks",
        })),
      });
    }

    return created;
  });

  if (!comment) return NextResponse.json({ ok: false, error: "This task changed or is no longer available for updates." }, { status: 409 });
  return NextResponse.json({
    ok: true,
    comment: {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      author: comment.user.name || comment.user.email,
      authorId: comment.user.id,
      authorAvatarUrl: userAvatarUrl(comment.user.id, comment.user.avatar),
    },
  }, { status: 201 });
}
