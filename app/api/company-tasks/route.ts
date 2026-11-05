import { NextResponse } from "next/server";
import { TaskStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID, ensureCompanyTaskProject } from "@/services/company-tasks";

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, name: true, email: true } },
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

  const managerTeams = user.role === UserRole.MANAGER
    ? await prisma.teamMembership.findMany({ where: { userId: user.id, role: "MANAGER" }, select: { teamId: true } })
    : [];
  const teamMemberIds = managerTeams.length ? (await prisma.teamMembership.findMany({ where: { teamId: { in: managerTeams.map((team) => team.teamId) } }, select: { userId: true } })).map((membership) => membership.userId) : [];
  const tasks = await prisma.task.findMany({
    where: {
      projectId: COMPANY_TASK_PROJECT_ID,
      ...(user.role === UserRole.ADMIN ? {} : { assigneeId: { in: [...new Set([user.id, ...teamMemberIds])] } }),
    },
    select: taskSelect,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ ok: true, tasks });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
    return NextResponse.json({ ok: false, error: "Manager access is required to assign tasks." }, { status: 403 });
  }

  let payload: {
    title?: unknown;
    description?: unknown;
    assigneeId?: unknown;
    dueDate?: unknown;
    priority?: unknown;
    checklistItems?: unknown;
  } | null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  const description = typeof payload?.description === "string" ? payload.description.trim() : "";
  const assigneeId = typeof payload?.assigneeId === "string" ? payload.assigneeId.trim() : "";
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

  let dueDate: Date | null = null;
  if (payload?.dueDate !== undefined && payload.dueDate !== null && payload.dueDate !== "") {
    if (typeof payload.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate)) {
      return NextResponse.json({ ok: false, error: "Enter a valid due date." }, { status: 400 });
    }
    dueDate = new Date(`${payload.dueDate}T00:00:00.000Z`);
    if (Number.isNaN(dueDate.getTime()) || dueDate.toISOString().slice(0, 10) !== payload.dueDate) {
      return NextResponse.json({ ok: false, error: "Enter a valid due date." }, { status: 400 });
    }
  }

  const managerTeams = user.role === UserRole.MANAGER
    ? await prisma.teamMembership.findMany({ where: { userId: user.id, role: "MANAGER" }, select: { teamId: true } })
    : [];
  const assignee = await prisma.user.findFirst({
    where: { id: assigneeId, role: { not: UserRole.ADMIN } },
    select: { id: true },
  });
  if (!assignee) {
    return NextResponse.json({ ok: false, error: "Choose an active employee account." }, { status: 400 });
  }
  if (user.role === UserRole.MANAGER && !await prisma.teamMembership.findFirst({ where: { userId: assignee.id, teamId: { in: managerTeams.map((team) => team.teamId) } }, select: { id: true } })) {
    return NextResponse.json({ ok: false, error: "You can only assign tasks to members of your teams." }, { status: 403 });
  }

  const project = await ensureCompanyTaskProject(user.id);
  const task = await prisma.$transaction(async (tx) => {
    const createdTask = await tx.task.create({
      data: {
        title,
        description: description || null,
        issueType: "TASK",
        status: TaskStatus.TODO,
        priority: priority as "LOW" | "MEDIUM" | "HIGH",
        dueDate,
        projectId: project.id,
        assigneeId: assignee.id,
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

  return NextResponse.json({ ok: true, task }, { status: 201 });
}
