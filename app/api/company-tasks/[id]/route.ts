import { NextResponse } from "next/server";
import { USER_IDENTITY_SELECT, withAvatarUrl } from "@/lib/user-avatar";
import { Prisma, TaskStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

import { canChangeCompanyTaskStatus } from "@/lib/company-task-workflow";
import { deleteManagedCompanyTask, parseCompanyTaskDetails, validateCompanyTaskUpdateFields, validateCompanyTaskDateRange } from "@/lib/company-task-management";
import { companyTaskAccessWhere } from "@/lib/company-task-access";
import { MAX_SUBMISSION_BODY_BYTES, validateSubmissionImages } from "@/lib/submission-images";
import { readLimitedFormData, UploadTooLargeError } from "@/lib/limited-form-data";
import { InvalidSubmissionImageError, prepareSubmissionImage } from "@/lib/prepare-submission-image";
import { companyTaskRepeatSelect, serializeTaskRepeat } from "@/lib/company-task-repeat";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const multipart = request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data") === true;
  if (multipart) {
    // Authorize before buffering or decoding an upload, then recheck in the transaction.
    if (user.role === UserRole.ADMIN) {
      return NextResponse.json({ ok: false, error: "Only the assigned employee can submit completion images." }, { status: 403 });
    }
    const task = await prisma.task.findFirst({
      where: { id, projectId: COMPANY_TASK_PROJECT_ID, assigneeId: user.id },
      select: { status: true },
    });
    if (!task) return NextResponse.json({ ok: false, error: "Task not found or access denied." }, { status: 404 });
    if (!canChangeCompanyTaskStatus(user.role, false, task.status, TaskStatus.SUBMITTED_FOR_REVIEW)) {
      return NextResponse.json({ ok: false, error: "This task is not ready to submit for review." }, { status: 409 });
    }
  }

  let payload: Record<string, unknown>;
  const imageFiles: File[] = [];
  try {
    if (multipart) {
      const form = await readLimitedFormData(request, MAX_SUBMISSION_BODY_BYTES);
      payload = {};
      for (const [key, value] of form) {
        if (key === "images" && value instanceof File) imageFiles.push(value);
        else if (["status", "notes"].includes(key) && typeof value === "string" && !Object.hasOwn(payload, key)) payload[key] = value;
        else throw new Error("Invalid submission field.");
      }
      if (payload.status !== TaskStatus.SUBMITTED_FOR_REVIEW) throw new Error("Images require a task submission.");
    } else {
      const body: unknown = await request.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request body.");
      payload = body as Record<string, unknown>;
    }
  } catch (error) {
    if (error instanceof UploadTooLargeError) return NextResponse.json({ ok: false, error: error.message }, { status: 413 });
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const imageError = validateSubmissionImages(imageFiles);
  if (imageError) return NextResponse.json({ ok: false, error: imageError }, { status: 400 });

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
  const fieldAccess = validateCompanyTaskUpdateFields(user.role, submittedKeys);
  if (!fieldAccess.ok) {
    return NextResponse.json({ ok: false, error: fieldAccess.error }, { status: fieldAccess.status });
  }
  const details = parseCompanyTaskDetails(payload);
  if (!details.ok) {
    return NextResponse.json({ ok: false, error: details.error }, { status: 400 });
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
        where: { id: nextAssigneeId, role: { not: UserRole.ADMIN }, isBlocked: false, OR: [{ employeeProfile: null }, { employeeProfile: { employmentStatus: { not: "INACTIVE" } } }] },
        select: { id: true },
      });
      if (!employee) {
        return NextResponse.json({ ok: false, error: "Choose an active employee account." }, { status: 400 });
      }
    }
  }
  if (!reportBlocker && status === undefined && priority === undefined && nextAssigneeId === undefined && !Object.keys(details.data).length) {
    return NextResponse.json({ ok: false, error: "No task updates provided." }, { status: 400 });
  }

  const images: Awaited<ReturnType<typeof prepareSubmissionImage>>[] = [];
  try {
    // Sequential decoding keeps peak memory bounded on a small VPS.
    for (const file of imageFiles) images.push(await prepareSubmissionImage(file));
  } catch (error) {
    if (error instanceof InvalidSubmissionImageError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    throw error;
  }
  const task = await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({
      where: {
        id,
        projectId: COMPANY_TASK_PROJECT_ID,
        ...companyTaskAccessWhere(user),
      },
      select: { id: true, title: true, assigneeId: true, status: true, startDate: true, dueDate: true },
    });
    if (!existing) return null;

    if ("startDate" in details.data || "dueDate" in details.data) {
      const rangeError = validateCompanyTaskDateRange(
        details.data.startDate === undefined ? existing.startDate : details.data.startDate,
        details.data.dueDate === undefined ? existing.dueDate : details.data.dueDate,
      );
      if (rangeError) return { rangeError };
    }

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
        ...details.data,
        ...(status === undefined ? {} : { status: status as TaskStatus }),
        ...(priority === undefined ? {} : { priority: priority as "LOW" | "MEDIUM" | "HIGH" }),
        ...(nextAssigneeId === undefined ? {} : { assigneeId: nextAssigneeId }),
      },
      select: {
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
        assigneeId: true,
        assignee: { select: USER_IDENTITY_SELECT },
        checklistItems: {
          orderBy: { position: "asc" },
          select: { id: true, title: true, isCompleted: true, position: true },
        },
      },
    });

    const rangeChanged = (details.data.startDate !== undefined && (details.data.startDate?.getTime() ?? null) !== (existing.startDate?.getTime() ?? null))
      || (details.data.dueDate !== undefined && (details.data.dueDate?.getTime() ?? null) !== (existing.dueDate?.getTime() ?? null));
    if (rangeChanged && updated.assigneeId && updated.assigneeId !== user.id) {
      await tx.notification.create({
        data: {
          userId: updated.assigneeId, actorId: user.id, taskId: updated.id,
          projectId: COMPANY_TASK_PROJECT_ID, type: "DUE_DATE_CHANGED",
          message: `${user.name || user.email} updated the date range for "${updated.title}"`,
          href: "/company-tasks",
        },
      });
    }

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
          data: {
            taskId: existing.id, submittedById: user.id, notes: notes || null,
            ...(images.length ? { images: { create: images } } : {}),
          },
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
            message: `${user.name || user.email} reassigned "${updated.title}"`,
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
          message: `${user.name || user.email} assigned you "${updated.title}"`,
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

  if ("rangeError" in task) {
    return NextResponse.json({ ok: false, error: task.rangeError }, { status: 400 });
  }

  return NextResponse.json({ ok: true, task: { ...serializeTaskRepeat(task), assignee: task.assignee ? withAvatarUrl(task.assignee) : null } });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (user.role !== UserRole.ADMIN) {
    return NextResponse.json({ ok: false, error: "Administrator access is required to delete tasks." }, { status: 403 });
  }
  const { id } = await params;
  try {
    const result = await prisma.$transaction(
      (transaction) => deleteManagedCompanyTask(transaction, user, id, COMPANY_TASK_PROJECT_ID),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const { status, ...body } = result;
    return NextResponse.json(body, { status });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
      if (error.code === "P2034") return NextResponse.json({ ok: false, error: "This task changed while it was being deleted. Please try again." }, { status: 409 });
    }
    throw error;
  }
}
