import { NextResponse } from "next/server";
import { TaskStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID, ensureCompanyTaskProject } from "@/services/company-tasks";
import { parseCompanyTaskDetails, validateCompanyTaskDateRange } from "@/lib/company-task-management";
import { USER_IDENTITY_SELECT, withAvatarUrl } from "@/lib/user-avatar";
import { companyTaskRepeatSelect, firstRepeatWorkday, nextCalendarDay, parseTaskRepeat, serializeTaskRepeat } from "@/lib/company-task-repeat";
import { employeeDayKey } from "@/lib/company-workdays";
import { ensureDailyCompanyTasks } from "@/services/recurring-company-tasks";

const taskSelect = {
  ...companyTaskRepeatSelect,
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  startDate: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: USER_IDENTITY_SELECT },
  createdById: true,
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  archivedAt: true,
  assignedBy: { select: { id: true, name: true, email: true } },
  checklistItems: {
    orderBy: { position: "asc" },
    select: { id: true, title: true, isCompleted: true, position: true },
  },
} as const;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  await ensureDailyCompanyTasks();

  const managerTeams = user.role === UserRole.MANAGER
    ? await prisma.teamMembership.findMany({ where: { userId: user.id, role: "MANAGER" }, select: { teamId: true } })
    : [];
  const teamMemberIds = managerTeams.length ? (await prisma.teamMembership.findMany({ where: { teamId: { in: managerTeams.map((team) => team.teamId) } }, select: { userId: true } })).map((membership) => membership.userId) : [];
  const tasks = await prisma.task.findMany({
    where: {
      projectId: COMPANY_TASK_PROJECT_ID, deletedAt: null, archivedAt: null,
      ...(user.role === UserRole.ADMIN ? {} : { assigneeId: { in: [...new Set([user.id, ...teamMemberIds])] } }),
    },
    select: taskSelect,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ ok: true, tasks: tasks.map(task => ({ ...serializeTaskRepeat(task), assignee: task.assignee ? withAvatarUrl(task.assignee) : null })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    title?: unknown;
    description?: unknown;
    assigneeId?: unknown;
    startDate?: unknown;
    dueDate?: unknown;
    priority?: unknown;
    checklistItems?: unknown;
    repeat?: unknown;
    repeatUntil?: unknown;
  } | null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  const description = typeof payload?.description === "string" ? payload.description.trim() : "";
  const requestedAssigneeId = typeof payload?.assigneeId === "string" ? payload.assigneeId.trim() : "";
  if (user.role === UserRole.USER && requestedAssigneeId && requestedAssigneeId !== user.id) {
    return NextResponse.json({ ok: false, error: "You can only create tasks for yourself." }, { status: 403 });
  }
  const assigneeId = user.role === UserRole.USER ? user.id : requestedAssigneeId;
  const priority = payload?.priority === undefined ? "MEDIUM" : payload.priority;
  const checklistItems = payload?.checklistItems === undefined ? [] : payload.checklistItems;
  if (title.length < 2 || title.length > 200) {
    return NextResponse.json({ ok: false, error: "Task title must be between 2 and 200 characters." }, { status: 400 });
  }
  if (description.length > 2000) {
    return NextResponse.json({ ok: false, error: "Task description must be 2000 characters or fewer." }, { status: 400 });
  }
  if (
    !Array.isArray(checklistItems)
    || checklistItems.length > 20
    || checklistItems.some((item) => typeof item !== "string" || !item.trim() || item.trim().length > 200)
  ) {
    return NextResponse.json({ ok: false, error: "Add up to 20 checklist items, each between 1 and 200 characters." }, { status: 400 });
  }
  if (!assigneeId) {
    return NextResponse.json({ ok: false, error: "Choose an employee to assign this task to." }, { status: 400 });
  }
  if (typeof priority !== "string" || !["LOW", "MEDIUM", "HIGH"].includes(priority)) {
    return NextResponse.json({ ok: false, error: "Choose a valid task priority." }, { status: 400 });
  }

  const details = parseCompanyTaskDetails(payload ?? {});
  if (!details.ok) return NextResponse.json({ ok: false, error: details.error }, { status: 400 });
  const { startDate, dueDate } = details.data;
  const rangeError = validateCompanyTaskDateRange(startDate, dueDate);
  if (rangeError) return NextResponse.json({ ok: false, error: rangeError }, { status: 400 });
  const repeat = parseTaskRepeat(payload ?? {});
  if (!repeat.ok) return NextResponse.json({ ok: false, error: repeat.error }, { status: 400 });
  if (repeat.daily && (startDate!.toISOString().slice(0, 10) < employeeDayKey() || startDate!.getTime() !== dueDate!.getTime() || (repeat.endDate && repeat.endDate < startDate!))) {
    return NextResponse.json({ ok: false, error: "Daily tasks need a first date of today or later and a single-day deadline. The last repeat date must be on or after the first date." }, { status: 400 });
  }

  const managerTeams = user.role === UserRole.MANAGER
    ? await prisma.teamMembership.findMany({ where: { userId: user.id, role: "MANAGER" }, select: { teamId: true } })
    : [];
  const assignee = await prisma.user.findFirst({
    where: { id: assigneeId, role: { not: UserRole.ADMIN }, isBlocked: false, OR: [{ employeeProfile: null }, { employeeProfile: { employmentStatus: { not: "INACTIVE" } } }] },
    select: { id: true },
  });
  if (!assignee) {
    return NextResponse.json({ ok: false, error: "Choose an active employee account." }, { status: 400 });
  }
  if (user.role === UserRole.MANAGER && !await prisma.teamMembership.findFirst({ where: { userId: assignee.id, teamId: { in: managerTeams.map((team) => team.teamId) } }, select: { id: true } })) {
    return NextResponse.json({ ok: false, error: "You can only assign tasks to members of your teams." }, { status: 403 });
  }

  const project = await ensureCompanyTaskProject(user.id);
  let firstDate = startDate!;
  if (repeat.daily) {
    const leave = await prisma.employeeLeaveDay.findMany({ where: { employeeId: assignee.id, day: { gte: startDate! } }, select: { day: true } });
    const firstDay = firstRepeatWorkday(startDate!.toISOString().slice(0, 10), repeat.endDate?.toISOString().slice(0, 10) ?? null, leave.map(item => item.day.toISOString().slice(0, 10)));
    if (!firstDay) return NextResponse.json({ ok: false, error: "There are no working days in this repeat date range." }, { status: 400 });
    firstDate = new Date(`${firstDay}T00:00:00Z`);
  }
  const task = await prisma.$transaction(async (tx) => {
    const recurrence = repeat.daily ? await tx.companyTaskRecurrence.create({ data: {
      title, description: description || null, priority: priority as "LOW" | "MEDIUM" | "HIGH", checklistItems: checklistItems.map(item => item.trim()),
      projectId: project.id, assigneeId: assignee.id, createdById: user.id, startDate: firstDate, endDate: repeat.endDate,
      nextDate: new Date(`${nextCalendarDay(firstDate.toISOString().slice(0, 10))}T00:00:00Z`),
      isActive: !repeat.endDate || firstDate < repeat.endDate,
    } }) : null;
    const createdTask = await tx.task.create({
      data: {
        title,
        description: description || null,
        issueType: "TASK",
        status: TaskStatus.TODO,
        priority: priority as "LOW" | "MEDIUM" | "HIGH",
        startDate: firstDate,
        dueDate: repeat.daily ? firstDate : dueDate,
        ...(recurrence ? { recurrenceId: recurrence.id, recurrenceDate: firstDate } : {}),
        projectId: project.id,
        assigneeId: assignee.id,
        assignedById: user.id,
        createdById: user.id,
        checklistItems: {
          create: checklistItems.map((item, position) => ({
            title: item.trim(),
            position,
          })),
        },
      },
      select: taskSelect,
    });
    await tx.taskStatusHistory.create({
      data: { taskId: createdTask.id, actorId: user.id, fromStatus: null, toStatus: TaskStatus.TODO },
    });
    await tx.notification.create({
      data: {
        userId: assignee.id,
        actorId: user.id,
        projectId: project.id,
        taskId: createdTask.id,
        type: "TASK_ASSIGNED",
        message: `${user.name || user.email} assigned you "${createdTask.title}"`,
        href: "/company-tasks",
      },
    });
    return createdTask;
  });

  return NextResponse.json({ ok: true, task: { ...serializeTaskRepeat(task), assignee: task.assignee ? withAvatarUrl(task.assignee) : null } }, { status: 201 });
}
