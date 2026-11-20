import { companyTaskAccessWhere } from "@/lib/company-task-access";
import { taskDateKey } from "@/lib/task-dates";
import { NextResponse } from "next/server";
import { companyTaskHref } from "@/lib/company-task-links";
import { NotificationType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessibleProjectWhere, accessibleTaskWhere } from "@/project-access";
import type { Prisma } from "@prisma/client";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import { USER_IDENTITY_SELECT, withAvatarUrl } from "@/lib/user-avatar";
import { accessibleTodoListWhere } from "@/lib/todo-access";
import { dispatchPersonalTaskReminders } from "@/services/personal-task-reminders";

// Keep history, unread badges, and mark-read actions scoped to current access.
function notificationAccessWhere(user: { id: string; role: string }): Prisma.NotificationWhereInput {
  return {
    userId: user.id,
    OR: [
      {
        projectId: { not: COMPANY_TASK_PROJECT_ID },
        project: { is: accessibleProjectWhere(user.id) },
        OR: [
          { taskId: null },
          { task: { is: accessibleTaskWhere(user.id) } },
          { type: { in: [NotificationType.TASK_ASSIGNED, NotificationType.TASK_UNASSIGNED] } },
        ],
      },
      {
        projectId: COMPANY_TASK_PROJECT_ID,
        ...(user.role === "USER" ? { type: { not: NotificationType.TASK_SUBMITTED } } : {}),
        OR: [
          { task: { is: { projectId: COMPANY_TASK_PROJECT_ID, ...companyTaskAccessWhere(user) } } },
          // The recipient may legitimately lose task access when unassigned.
          { type: NotificationType.TASK_UNASSIGNED },
        ],
      },
      { type: NotificationType.PERSONAL_TASK_REMINDER, todoTask: { is: { list: accessibleTodoListWhere(user.id) } } },
    ],
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  await dispatchPersonalTaskReminders(user.id);
  const where = notificationAccessWhere(user);
  const params = new URL(request.url).searchParams;
  const from = taskDateKey(params.get("from"));
  const to = taskDateKey(params.get("to"));
  if ((params.get("from") && !from) || (params.get("to") && !to) || (from && to && from > to)) {
    return NextResponse.json({ ok: false, error: "Choose a valid date range." }, { status: 400 });
  }
  const type = params.get("type");
  if (type && !Object.values(NotificationType).includes(type as NotificationType)) {
    return NextResponse.json({ ok: false, error: "Choose a valid notification type." }, { status: 400 });
  }
  const pageValue = Number(params.get("page") || 1);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 10000) : 1;
  const filteredWhere: Prisma.NotificationWhereInput = {
    ...where,
    ...(type ? { type: type as NotificationType } : {}),
    ...(params.get("read") === "unread" ? { readAt: null } : params.get("read") === "read" ? { readAt: { not: null } } : {}),
    ...(from || to ? { createdAt: {
      ...(from ? { gte: new Date(`${from}T00:00:00+05:30`) } : {}),
      ...(to ? { lt: new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86400000) } : {}),
    } } : {}),
  };
  const [unreadCount, notifications] = await Promise.all([
    prisma.notification.count({ where: { ...where, readAt: null } }),
    prisma.notification.findMany({
      where: filteredWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 50,
      take: 51,
      select: {
        id: true,
        type: true,
        message: true,
        href: true,
        projectId: true,
        taskId: true,
        task: { select: { assigneeId: true } },
        actor: { select: USER_IDENTITY_SELECT },
        readAt: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    unreadCount,
    hasMore: notifications.length > 50,
    notifications: notifications.slice(0, 50).map((notification) => ({
      ...notification,
      actor: notification.actor ? withAvatarUrl(notification.actor) : null,
      href: notification.projectId === COMPANY_TASK_PROJECT_ID && notification.taskId ? companyTaskHref(user.role, user.id, notification.taskId, notification.task?.assigneeId ?? null, notification.type === "TASK_SUBMITTED") : notification.href,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
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
    ? { ...notificationAccessWhere(user), readAt: null }
    : typeof payload.notificationId === "string" && payload.notificationId.trim()
      ? { ...notificationAccessWhere(user), id: payload.notificationId.trim(), readAt: null }
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
