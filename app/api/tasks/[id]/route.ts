import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { accessibleTaskWhere } from "@/project-access";
import { canManageProject, canManageProjectTasks } from "@/lib/project-task-permissions";
import { recordActiveSprintProgress } from "@/services/sprint-progress";
import {
  buildTaskNotifications,
  getTaskNotificationRecipientIds,
} from "@/services/notifications";

const ISSUE_TYPES = new Set(["EPIC", "STORY", "TASK", "BUG"]);
const TASK_STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);
const TASK_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);

type TaskUpdatePayload = {
  title?: string;
  description?: string;
  issueType?: string;
  status?: string;
  priority?: string;
  storyPoints?: number | string | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  sprintId?: string | null;
};

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function parseDueDate(value: unknown): Date | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function parseNullableId(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function parseStoryPoints(value: unknown): number | null | undefined {
  if (value === null || value === "") {
    return null;
  }

  if (value === undefined) {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return undefined;
  }

  return parsed;
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  const { id: taskId } = await params;
  if (!taskId) {
    return NextResponse.json(
      { ok: false, error: "Task id is required." },
      { status: 400 },
    );
  }

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      ...accessibleTaskWhere(user.id),
    },
    select: {
      id: true,
      title: true,
      status: true,
      assigneeId: true,
      dueDate: true,
      projectId: true,
      project: {
        select: {
          ownerId: true,
          members: {
            select: {
              userId: true,
            },
          },
          team: {
            select: {
              memberships: { select: { userId: true, role: true } },
            },
          },
        },
      },
    },
  });

  if (!task) {
    return NextResponse.json(
      { ok: false, error: "Task not found." },
      { status: 404 },
    );
  }

  let payload: TaskUpdatePayload | null = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const teamMembership = task.project.team?.memberships.find((membership) => membership.userId === user.id);
  if (!canManageProjectTasks(task.project, user.id)) {
    if (!teamMembership || task.assigneeId !== user.id) {
      return NextResponse.json({ ok: false, error: "Team members can update the status of issues assigned to them." }, { status: 403 });
    }
    const submittedKeys = Object.keys(payload ?? {});
    if (submittedKeys.length !== 1 || submittedKeys[0] !== "status") {
      return NextResponse.json({ ok: false, error: "Team members can update the status of their assigned issues; ask a manager to change issue details or assignments." }, { status: 403 });
    }
  }

  const data: {
    title?: string;
    description?: string | null;
    issueType?: "EPIC" | "STORY" | "TASK" | "BUG";
    status?: "TODO" | "IN_PROGRESS" | "DONE";
    priority?: "LOW" | "MEDIUM" | "HIGH";
    storyPoints?: number | null;
    dueDate?: Date | null;
    assigneeId?: string | null;
    sprintId?: string | null;
  } = {};

  if (typeof payload?.title === "string") {
    const title = payload.title.trim();
    if (title.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Task title must be at least 2 characters." },
        { status: 400 },
      );
    }
    data.title = title;
  }

  if (typeof payload?.description === "string") {
    const description = payload.description.trim();
    data.description = description || null;
  }

  if (typeof payload?.issueType === "string") {
    if (!ISSUE_TYPES.has(payload.issueType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid issue type." },
        { status: 400 },
      );
    }
    data.issueType = payload.issueType as "EPIC" | "STORY" | "TASK" | "BUG";
  }

  if (typeof payload?.status === "string") {
    if (!TASK_STATUSES.has(payload.status)) {
      return NextResponse.json(
        { ok: false, error: "Invalid status." },
        { status: 400 },
      );
    }
    data.status = payload.status as "TODO" | "IN_PROGRESS" | "DONE";
  }

  if (typeof payload?.priority === "string") {
    if (!TASK_PRIORITIES.has(payload.priority)) {
      return NextResponse.json(
        { ok: false, error: "Invalid priority." },
        { status: 400 },
      );
    }
    data.priority = payload.priority as "LOW" | "MEDIUM" | "HIGH";
  }

  if ("storyPoints" in (payload ?? {})) {
    const parsed = parseStoryPoints(payload?.storyPoints);
    if (parsed === undefined) {
      return NextResponse.json(
        { ok: false, error: "Story points must be a whole number between 1 and 100." },
        { status: 400 },
      );
    }
    data.storyPoints = parsed;
  }

  if ("dueDate" in (payload ?? {})) {
    const parsed = parseDueDate(payload?.dueDate ?? null);
    if (parsed === undefined) {
      return NextResponse.json(
        { ok: false, error: "Invalid due date." },
        { status: 400 },
      );
    }
    data.dueDate = parsed;
  }

  if ("assigneeId" in (payload ?? {})) {
    const parsed = parseNullableId(payload?.assigneeId ?? null);
    if (parsed === undefined) {
      return NextResponse.json(
        { ok: false, error: "Invalid assignee." },
        { status: 400 },
      );
    }

    const collaboratorIds = new Set([
      task.project.ownerId,
      ...task.project.members.map((member) => member.userId),
      ...(task.project.team?.memberships.map((member) => member.userId) ?? []),
    ]);

    if (parsed && !collaboratorIds.has(parsed)) {
      return NextResponse.json(
        { ok: false, error: "Assignee must be part of this project." },
        { status: 400 },
      );
    }

    data.assigneeId = parsed;
  }

  if ("sprintId" in (payload ?? {})) {
    const parsed = parseNullableId(payload?.sprintId ?? null);
    if (parsed === undefined) {
      return NextResponse.json(
        { ok: false, error: "Invalid sprint." },
        { status: 400 },
      );
    }

    if (parsed) {
      const sprint = await prisma.sprint.findFirst({
        where: {
          id: parsed,
          projectId: task.projectId,
        },
        select: {
          id: true,
        },
      });

      if (!sprint) {
        return NextResponse.json(
          { ok: false, error: "Sprint not found for this project." },
          { status: 400 },
        );
      }
    }

    data.sprintId = parsed;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { ok: false, error: "No updates provided." },
      { status: 400 },
    );
  }

  const shouldLogCompletion = data.status === "DONE" && task.status !== "DONE";
  const assigneeChanged = "assigneeId" in data && task.assigneeId !== (data.assigneeId ?? null);
  const dueDateChanged = "dueDate" in data
    && task.dueDate?.toISOString().slice(0, 10) !== data.dueDate?.toISOString().slice(0, 10);
  const nextAssigneeId = "assigneeId" in data ? data.assigneeId ?? null : task.assigneeId;

  const updatedTask = await prisma.$transaction(async (tx) => {
    const nextTask = await tx.task.update({
      where: {
        id: taskId,
      },
      data,
      select: {
        id: true,
        title: true,
        description: true,
        issueType: true,
        status: true,
        priority: true,
        storyPoints: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        sprint: {
          select: {
            id: true,
            title: true,
            isActive: true,
          },
        },
      },
    });

    if (shouldLogCompletion) {
      await tx.activity.create({
        data: {
          type: "TASK_COMPLETED",
          message: `completed ${nextTask.issueType.toLowerCase()} \"${nextTask.title}\"`,
          userId: user.id,
          projectId: task.projectId,
          taskId: nextTask.id,
        },
      });
    }

    if (assigneeChanged) {
      if (nextAssigneeId) {
        const notifications = buildTaskNotifications({
          recipientIds: [nextAssigneeId],
          actorId: user.id,
          projectId: task.projectId,
          taskId: nextTask.id,
          type: "TASK_ASSIGNED",
          message: `${user.name || user.email} assigned you to "${nextTask.title}"`,
        });
        if (notifications.length) {
          await tx.notification.createMany({ data: notifications });
        }
      } else if (task.assigneeId) {
        const notifications = buildTaskNotifications({
          recipientIds: [task.assigneeId],
          actorId: user.id,
          projectId: task.projectId,
          taskId: nextTask.id,
          type: "TASK_UNASSIGNED",
          message: `${user.name || user.email} unassigned you from "${nextTask.title}"`,
        });
        if (notifications.length) {
          await tx.notification.createMany({ data: notifications });
        }
      }
    }

    if (dueDateChanged) {
      const newDueDate = data.dueDate;
      const dueDateLabel = newDueDate
        ? newDueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
        : "no due date";
      const notifications = buildTaskNotifications({
        recipientIds: getTaskNotificationRecipientIds(
          task.project,
          nextAssigneeId,
          nextAssigneeId === null,
        ),
        actorId: user.id,
        projectId: task.projectId,
        taskId: nextTask.id,
        type: "DUE_DATE_CHANGED",
        message: `${user.name || user.email} changed the due date for "${nextTask.title}" to ${dueDateLabel}`,
      });
      if (notifications.length) {
        await tx.notification.createMany({ data: notifications });
      }
    }

    return nextTask;
  });

  await recordActiveSprintProgress(task.projectId);

  return NextResponse.json({ ok: true, task: updatedTask });
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  const { id: taskId } = await params;
  if (!taskId) {
    return NextResponse.json(
      { ok: false, error: "Task id is required." },
      { status: 400 },
    );
  }

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      ...accessibleTaskWhere(user.id),
    },
    select: {
      id: true,
      projectId: true,
      project: {
        select: {
          ownerId: true,
          members: { select: { userId: true } },
          team: {
            select: {
              memberships: { select: { userId: true, role: true } },
            },
          },
        },
      },
    },
  });

  if (!task) {
    return NextResponse.json(
      { ok: false, error: "Task not found." },
      { status: 404 },
    );
  }

  if (!canManageProject(task.project, user.id)) {
    return NextResponse.json(
      { ok: false, error: "Only the project owner or connected team manager can delete tasks." },
      { status: 403 },
    );
  }

  await prisma.task.delete({
    where: {
      id: taskId,
    },
  });

  await recordActiveSprintProgress(task.projectId);

  return NextResponse.json({ ok: true });
}