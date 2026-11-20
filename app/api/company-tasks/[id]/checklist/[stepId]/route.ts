import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

type RouteContext = { params: Promise<{ id: string; stepId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (user.role === UserRole.ADMIN) {
    return NextResponse.json({ ok: false, error: "Only the assigned employee can update checklist progress." }, { status: 403 });
  }

  let payload: { isCompleted?: unknown } | null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  if (typeof payload?.isCompleted !== "boolean" || Object.keys(payload).length !== 1) {
    return NextResponse.json({ ok: false, error: "Choose whether this checklist item is complete." }, { status: 400 });
  }

  const { id, stepId } = await params;
  const result = await prisma.$transaction(async (transaction) => {
    const task = await transaction.task.findFirst({
      where: { id, projectId: COMPANY_TASK_PROJECT_ID, deletedAt: null, archivedAt: null, assigneeId: user.id },
      select: { id: true, status: true, updatedAt: true },
    });
    if (!task) return null;
    if (!["TODO", "ACCEPTED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(task.status)) return null;
    const before = await transaction.companyTaskChecklistItem.findFirst({ where: { id: stepId, taskId: task.id }, select: { title: true, isCompleted: true } });
    if (!before) return null;
    // Serialize checklist progress with submissions, archiving and recycling.
    const claimed = await transaction.task.updateMany({ where: { id: task.id, deletedAt: null, archivedAt: null, status: task.status, updatedAt: task.updatedAt }, data: { updatedAt: new Date() } });
    if (!claimed.count) return null;

    const updated = await transaction.companyTaskChecklistItem.updateMany({
      where: { id: stepId, taskId: task.id },
      data: { isCompleted: payload.isCompleted as boolean },
    });
    if (!updated.count) return null;
    if (before.isCompleted !== payload.isCompleted) await transaction.taskChange.create({ data: { taskId: task.id, actorId: user.id, action: "CHECKLIST_UPDATED", before, after: { title: before.title, isCompleted: payload.isCompleted as boolean } } });

    return transaction.companyTaskChecklistItem.findUnique({
      where: { id: stepId },
      select: { id: true, title: true, isCompleted: true, position: true },
    });
  });

  if (!result) {
    return NextResponse.json({ ok: false, error: "Task or checklist item not found, or access denied." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, item: result });
}
