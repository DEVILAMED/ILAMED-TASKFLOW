import { NextResponse } from "next/server";
import { TaskStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let payload: { status?: unknown; priority?: unknown; assigneeId?: unknown } | null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const submittedKeys = Object.keys(payload ?? {});
  const status = payload?.status;
  const priority = payload?.priority;
  const assigneeId = payload?.assigneeId;
  const allowedKeys = user.role === UserRole.ADMIN
    ? new Set(["status", "priority", "assigneeId"])
    : new Set(["status"]);
  if (submittedKeys.some((key) => !allowedKeys.has(key))) {
    return NextResponse.json({ ok: false, error: "Unsupported task update." }, { status: 400 });
  }
  if (user.role !== UserRole.ADMIN && (submittedKeys.length !== 1 || submittedKeys[0] !== "status")) {
    return NextResponse.json({ ok: false, error: "Only administrators can change assignment or priority." }, { status: 403 });
  }
  const employeeStatuses: TaskStatus[] = [TaskStatus.ACCEPTED, TaskStatus.IN_PROGRESS, TaskStatus.ON_HOLD, TaskStatus.SUBMITTED_FOR_REVIEW, TaskStatus.REVISION_REQUESTED];
  if (status !== undefined && (typeof status !== "string" || (user.role === UserRole.ADMIN ? status !== TaskStatus.CANCELLED : !employeeStatuses.includes(status as TaskStatus)))) {
    return NextResponse.json({ ok: false, error: "Choose a valid task status." }, { status: 400 });
  }
  if (status !== undefined && user.role === UserRole.ADMIN && status !== TaskStatus.CANCELLED) {
    return NextResponse.json({ ok: false, error: "Use the review action to approve or request changes." }, { status: 400 });
  }
  if (priority !== undefined && user.role !== UserRole.ADMIN) {
    return NextResponse.json({ ok: false, error: "Only administrators can change task priority." }, { status: 403 });
  }
  if (priority !== undefined && (typeof priority !== "string" || !["LOW", "MEDIUM", "HIGH"].includes(priority))) {
    return NextResponse.json({ ok: false, error: "Choose a valid task priority." }, { status: 400 });
  }
  let nextAssigneeId: string | null | undefined;
  if (assigneeId !== undefined) {
    if (user.role !== UserRole.ADMIN) {
      return NextResponse.json({ ok: false, error: "Only administrators can change task assignments." }, { status: 403 });
    }
    if (assigneeId !== null && (typeof assigneeId !== "string" || !assigneeId.trim())) {
      return NextResponse.json({ ok: false, error: "Choose a valid employee." }, { status: 400 });
    }
    nextAssigneeId = typeof assigneeId === "string" ? assigneeId.trim() : null;
    if (nextAssigneeId) {
      const employee = await prisma.user.findFirst({
        where: { id: nextAssigneeId, role: { not: UserRole.ADMIN } },
        select: { id: true },
      });
      if (!employee) {
        return NextResponse.json({ ok: false, error: "Choose an active employee account." }, { status: 400 });
      }
    }
  }
  if (status === undefined && priority === undefined && nextAssigneeId === undefined) {
    return NextResponse.json({ ok: false, error: "No task updates provided." }, { status: 400 });
  }

  const { id } = await params;
  const task = await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({
      where: {
        id,
        projectId: COMPANY_TASK_PROJECT_ID,
        ...(user.role === UserRole.ADMIN ? {} : { assigneeId: user.id }),
      },
      select: { id: true, title: true, assigneeId: true, status: true },
    });
    if (!existing) return null;

    if (status !== undefined) {
      const allowedNext: Partial<Record<TaskStatus, TaskStatus[]>> = {
        [TaskStatus.TODO]: [TaskStatus.ACCEPTED, TaskStatus.IN_PROGRESS],
        [TaskStatus.ACCEPTED]: [TaskStatus.IN_PROGRESS, TaskStatus.ON_HOLD],
        [TaskStatus.IN_PROGRESS]: [TaskStatus.ON_HOLD, TaskStatus.SUBMITTED_FOR_REVIEW],
        [TaskStatus.ON_HOLD]: [TaskStatus.IN_PROGRESS],
        [TaskStatus.REVISION_REQUESTED]: [TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED_FOR_REVIEW],
      };
      const permitted = user.role === UserRole.ADMIN
        ? status === TaskStatus.CANCELLED && existing.status !== TaskStatus.APPROVED && existing.status !== TaskStatus.CANCELLED
        : allowedNext[existing.status]?.includes(status as TaskStatus) === true;
      if (!permitted) return { transitionError: true as const };
    }

    const updated = await tx.task.update({
      where: { id: existing.id },
      data: {
        ...(status === undefined ? {} : { status: status as TaskStatus }),
        ...(priority === undefined ? {} : { priority: priority as "LOW" | "MEDIUM" | "HIGH" }),
        ...(nextAssigneeId === undefined ? {} : { assigneeId: nextAssigneeId }),
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        assigneeId: true,
        assignee: { select: { id: true, name: true, email: true } },
        checklistItems: {
          orderBy: { position: "asc" },
          select: { id: true, title: true, isCompleted: true, position: true },
        },
      },
    });

    if (status !== undefined) {
      await tx.taskStatusHistory.create({
        data: { taskId: existing.id, actorId: user.id, fromStatus: existing.status, toStatus: status as TaskStatus },
      });
      if (status === TaskStatus.SUBMITTED_FOR_REVIEW) {
        await tx.taskSubmission.create({
          data: { taskId: existing.id, submittedById: user.id },
        });
        const managers = existing.assigneeId
          ? await tx.teamMembership.findMany({
              where: { userId: existing.assigneeId, team: { memberships: { some: { userId: { not: existing.assigneeId }, role: "MANAGER" } } } },
              select: { team: { select: { memberships: { where: { role: "MANAGER" }, select: { userId: true } } } } },
            })
          : [];
        const managerIds = [...new Set(managers.flatMap((membership) => membership.team.memberships.map((item) => item.userId)))];
        if (managerIds.length) {
          await tx.notification.createMany({ data: managerIds.map((managerId) => ({
            userId: managerId, actorId: user.id, projectId: COMPANY_TASK_PROJECT_ID, taskId: existing.id,
            type: "TASK_SUBMITTED" as const, message: `${user.name || user.email} submitted "${existing.title}" for review`, href: "/reports",
          })) });
        }
      }
    }

    if (nextAssigneeId !== undefined && nextAssigneeId !== existing.assigneeId) {
      const notifications = [];
      if (existing.assigneeId) {
        if (existing.assigneeId !== user.id) {
          notifications.push({
            userId: existing.assigneeId,
            actorId: user.id,
            projectId: COMPANY_TASK_PROJECT_ID,
            taskId: updated.id,
            type: "TASK_UNASSIGNED" as const,
            message: `${user.name || user.email} reassigned "${existing.title}"`,
            href: "/company-tasks",
          });
        }
      }
      if (nextAssigneeId && nextAssigneeId !== user.id) {
        notifications.push({
          userId: nextAssigneeId,
          actorId: user.id,
          projectId: COMPANY_TASK_PROJECT_ID,
          taskId: updated.id,
          type: "TASK_ASSIGNED" as const,
          message: `${user.name || user.email} assigned you "${existing.title}"`,
          href: "/company-tasks",
        });
      }
      if (notifications.length) {
        await tx.notification.createMany({ data: notifications });
      }
    }
    return updated;
  });

  if (!task) {
    return NextResponse.json({ ok: false, error: "Task not found or access denied." }, { status: 404 });
  }

  if ("transitionError" in task) {
    return NextResponse.json({ ok: false, error: "That status transition is not allowed." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, task });
}
