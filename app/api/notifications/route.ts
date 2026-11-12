import { NextResponse } from "next/server";
import { companyTaskHref } from "@/lib/company-task-links";
import { NotificationType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessibleProjectWhere, accessibleTaskWhere } from "@/project-access";
import type { Prisma } from "@prisma/client";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const where: Prisma.NotificationWhereInput = {
    userId: user.id,
    OR: [
      {
        project: { is: accessibleProjectWhere(user.id) },
        OR: [
          { taskId: null },
          { task: { is: accessibleTaskWhere(user.id) } },
          { type: { in: [NotificationType.TASK_ASSIGNED, NotificationType.TASK_UNASSIGNED] } },
        ],
      },
      { projectId: COMPANY_TASK_PROJECT_ID },
    ],
  };
  const [unreadCount, notifications] = await Promise.all([
    prisma.notification.count({ where: { ...where, readAt: null } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        message: true,
        href: true,
        projectId: true,
        taskId: true,
        task: { select: { assigneeId: true } },
        readAt: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    unreadCount,
    notifications: notifications.map((notification) => ({
      ...notification,
      href: notification.projectId === COMPANY_TASK_PROJECT_ID && notification.taskId ? companyTaskHref(user.role, user.id, notification.taskId, notification.task?.assigneeId ?? null, notification.type === "TASK_SUBMITTED") : notification.href,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let payload: { notificationId?: unknown; markAllRead?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const where = payload.markAllRead === true
    ? { userId: user.id, readAt: null }
    : typeof payload.notificationId === "string" && payload.notificationId.trim()
      ? { id: payload.notificationId.trim(), userId: user.id, readAt: null }
      : null;

  if (!where) {
    return NextResponse.json({ ok: false, error: "Choose a notification to mark as read." }, { status: 400 });
  }

  const result = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true, updatedCount: result.count });
}
