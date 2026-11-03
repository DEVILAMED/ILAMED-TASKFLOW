import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { listTasksByProject } from "@/services/taskService";
import { accessibleProjectWhere } from "@/project-access";
import { canManageProjectTasks } from "@/lib/project-task-permissions";
import { recordActiveSprintProgress } from "@/services/sprint-progress";
import { buildTaskNotifications } from "@/services/notifications";

const ISSUE_TYPES = new Set(["EPIC", "STORY", "TASK", "BUG"]);
const TASK_STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);
const TASK_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);

type TaskPayload = {
  projectId?: string;
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

function parseDueDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function parseNullableId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function parseStoryPoints(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return undefined;
  }

  return parsed;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "Project id is required." },
      { status: 400 },
    );
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...accessibleProjectWhere(user.id),
    },
    select: {
      id: true,
      ownerId: true,
      members: { select: { userId: true } },
      team: { select: { memberships: { select: { userId: true, role: true } } } },
    },
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Project not found." },
      { status: 404 },
    );
  }

  const allTasks = await listTasksByProject(projectId);
  const tasks = canManageProjectTasks(project, user.id)
    ? allTasks
    : allTasks.filter((task) => !task.assignee || task.assignee.id === user.id);

  return NextResponse.json({ ok: true, tasks });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  let payload: TaskPayload | null = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const projectId = typeof payload?.projectId === "string" ? payload.projectId : "";
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  const description = typeof payload?.description === "string" ? payload.description.trim() : "";
  const issueType: "EPIC" | "STORY" | "TASK" | "BUG" =
    typeof payload?.issueType === "string" && ISSUE_TYPES.has(payload.issueType)
      ? (payload.issueType as "EPIC" | "STORY" | "TASK" | "BUG")
      : "TASK";
  const status: "TODO" | "IN_PROGRESS" | "DONE" =
    typeof payload?.status === "string" && TASK_STATUSES.has(payload.status)
      ? (payload.status as "TODO" | "IN_PROGRESS" | "DONE")
      : "TODO";
  const priority: "LOW" | "MEDIUM" | "HIGH" =
    typeof payload?.priority === "string" && TASK_PRIORITIES.has(payload.priority)
      ? (payload.priority as "LOW" | "MEDIUM" | "HIGH")
      : "MEDIUM";
  const storyPoints = parseStoryPoints(payload?.storyPoints ?? null);
  const dueDate = parseDueDate(payload?.dueDate ?? null);
  const assigneeId = parseNullableId(payload?.assigneeId ?? null);
  const sprintId = parseNullableId(payload?.sprintId ?? null);

  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "Project id is required." },
      { status: 400 },
    );
  }

  if (title.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Task title must be at least 2 characters." },
      { status: 400 },
    );
  }

  if (storyPoints === undefined) {
    return NextResponse.json(
      { ok: false, error: "Story points must be a whole number between 1 and 100." },
      { status: 400 },
    );
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...accessibleProjectWhere(user.id),
    },
    select: {
      id: true,
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
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Project not found." },
      { status: 404 },
    );
  }

  const collaboratorIds = new Set([
    project.ownerId,
    ...project.members.map((member) => member.userId),
    ...(project.team?.memberships.map((member) => member.userId) ?? []),
  ]);

  if (!canManageProjectTasks(project, user.id)) {
    return NextResponse.json({ ok: false, error: "Only project owners, project members, or the connected team manager can create issues." }, { status: 403 });
  }

  if (assigneeId && !collaboratorIds.has(assigneeId)) {
    return NextResponse.json(
      { ok: false, error: "Assignee must be part of this project." },
      { status: 400 },
    );
  }

  if (sprintId) {
    const sprint = await prisma.sprint.findFirst({
      where: {
        id: sprintId,
        projectId,
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

  const task = await prisma.$transaction(async (tx) => {
    const createdTask = await tx.task.create({
      data: {
        title,
        description: description || null,
        issueType,
        status,
        priority,
        storyPoints,
        dueDate,
        projectId,
        assigneeId,
        sprintId,
      },
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

    await tx.activity.create({
      data: {
        type: "TASK_CREATED",
        message: `created ${createdTask.issueType.toLowerCase()} \"${createdTask.title}\"`,
        userId: user.id,
        projectId,
        taskId: createdTask.id,
      },
    });

    if (createdTask.assignee) {
      const assignmentNotifications = buildTaskNotifications({
        recipientIds: [createdTask.assignee.id],
        actorId: user.id,
        projectId,
        taskId: createdTask.id,
        type: "TASK_ASSIGNED",
        message: `${user.name || user.email} assigned you to "${createdTask.title}"`,
      });
      if (assignmentNotifications.length) {
        await tx.notification.createMany({ data: assignmentNotifications });
      }
    }

    return createdTask;
  });

  await recordActiveSprintProgress(projectId);

  return NextResponse.json({ ok: true, task }, { status: 201 });
}