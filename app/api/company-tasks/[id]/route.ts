import { NextResponse } from "next/server";
import { TaskStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

import { canChangeCompanyTaskStatus } from "@/lib/company-task-workflow";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let payload: { status?: unknown; priority?: unknown; assigneeId?: unknown; notes?: unknown; action?: unknown } | null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const notes = typeof payload?.notes === "string" ? payload.notes.trim() : "";
  if ((payload?.notes !== undefined && typeof payload.notes !== "string") || notes.length > 2000) {
    return NextResponse.json({ ok: false, error: "Notes must be at most 2000 characters." }, { status: 400 });
  }
  const reportBlocker = payload?.action === "REPORT_BLOCKER";
  if ((payload?.action !== undefined && !reportBlocker) || (reportBlocker && (!notes || payload?.status !== undefined))) {
    return NextResponse.json({ ok: false, error: "Provide a blocker explanation without changing the task status." }, { status: 400 });
  }
  const submittedKeys = Object.keys(payload ?? {});
  const status = payload?.status;
  const priority = payload?.priority;
  const assigneeId = payload?.assigneeId;
  const allowedKeys = user.role === UserRole.ADMIN
    ? new Set(["status", "priority", "assigneeId", "notes"])
    : new Set(["status", "notes", "action"]);
  if (submittedKeys.some((key) => !allowedKeys.has(key))) {
    return NextResponse.json({ ok: false, error: "Unsupported task update." }, { status: 400 });
  }
  if (user.role !== UserRole.ADMIN && (!reportBlocker && status === undefined)) {
    return NextResponse.json({ ok: false, error: "Only administrators can change assignment or priority." }, { status: 403 });
  }
  if (status !== undefined && (typeof status !== "string" || !Object.values(TaskStatus).includes(status as TaskStatus))) {
    return NextResponse.json({ ok: false, error: "Choose a valid task status." }, { status: 400 });
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
  if (!reportBlocker && status === undefined && priority === undefined && nextAssigneeId === undefined) {
    return NextResponse.json({ ok: false, error: "No task updates provided." }, { status: 400 });
  }

  const { id } = await params;
  const task = await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({
      where: {
        id,
        projectId: COMPANY_TASK_PROJECT_ID,
        ...(user.role === UserRole.ADMIN ? {} : user.role === UserRole.MANAGER ? {
          OR: [{ assigneeId: user.id }, { assignee: { teamMemberships: { some: { team: { memberships: { some: { userId: user.id, role: "MANAGER" } } } } } } }],
        } : { assigneeId: user.id }),
      },
      select: { id: true, title: true, assigneeId: true, status: true },
    });
    if (!existing) return null;

    const managesTask = user.role === UserRole.MANAGER && existing.assigneeId !== user.id;
    if (reportBlocker && (existing.assigneeId !== user.id || !["TODO", "ACCEPTED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(existing.status))) {
      return { transitionError: true as const };
    }
    if (status !== undefined && !canChangeCompanyTaskStatus(user.role, managesTask, existing.status, status as string)) {
      return { transitionError: true as const };
    }

    const updated = await tx.task.update({
      where: { id: existing.id, status: existing.status },
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

    if (reportBlocker || (status === TaskStatus.ON_HOLD && notes)) {
      await tx.comment.create({ data: { taskId: existing.id, userId: user.id, content: `${reportBlocker ? "Blocker reported" : "Hold reason"}: ${notes}` } });
    }
    if (reportBlocker) {
      const recipients = await tx.user.findMany({ where: { id: { not: user.id }, OR: [{ role: "ADMIN" }, { role: "MANAGER", teamMemberships: { some: { role: "MANAGER", team: { memberships: { some: { userId: user.id } } } } } }] }, select: { id: true, role: true } });
      if (recipients.length) await tx.notification.createMany({ data: recipients.map((person) => ({ userId: person.id, actorId: user.id, taskId: existing.id, projectId: COMPANY_TASK_PROJECT_ID, type: "TASK_COMMENTED" as const, message: `${user.name || user.email} reported a blocker on "${existing.title}": ${notes}`, href: person.role === "ADMIN" ? "/admin" : "/manager" })) });
    }
    if (status !== undefined && existing.assigneeId && existing.assigneeId !== user.id && [TaskStatus.ON_HOLD, TaskStatus.IN_PROGRESS].includes(status as "ON_HOLD" | "IN_PROGRESS")) {
      await tx.notification.create({ data: { userId: existing.assigneeId, actorId: user.id, taskId: existing.id, projectId: COMPANY_TASK_PROJECT_ID, type: "TASK_COMMENTED", message: `${user.name || user.email} ${status === "ON_HOLD" ? "put on hold" : "resumed"} "${existing.title}"`, href: "/company-tasks" } });
    }
    if (status !== undefined) {
      await tx.taskStatusHistory.create({
        data: { taskId: existing.id, actorId: user.id, fromStatus: existing.status, toStatus: status as TaskStatus },
      });
      if (status === TaskStatus.SUBMITTED_FOR_REVIEW) {
        await tx.taskSubmission.create({
          data: { taskId: existing.id, submittedById: user.id, notes: notes || null },
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
            type: "TASK_SUBMITTED" as const, message: `${user.name || user.email} submitted "${existing.title}" for review`, href: "/reviews",
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
