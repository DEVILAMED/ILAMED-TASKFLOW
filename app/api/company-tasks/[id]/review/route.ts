import { NextResponse } from "next/server";
import { ReviewDecision, TaskStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const reviewer = await getCurrentUser();
  if (!reviewer) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (reviewer.role !== UserRole.ADMIN && reviewer.role !== UserRole.MANAGER) {
    return NextResponse.json({ ok: false, error: "Manager access is required to review work." }, { status: 403 });
  }

  let payload: { decision?: unknown; rating?: unknown; feedback?: unknown } | null;
  try { payload = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const decision = payload?.decision;
  const feedback = typeof payload?.feedback === "string" ? payload.feedback.trim() : "";
  const rating = payload?.rating;
  if (typeof decision !== "string" || !Object.values(ReviewDecision).includes(decision as ReviewDecision)) {
    return NextResponse.json({ ok: false, error: "Choose approve, request revision, or reject." }, { status: 400 });
  }
  if (!feedback || feedback.length > 2000) {
    return NextResponse.json({ ok: false, error: "Review feedback must be between 1 and 2000 characters." }, { status: 400 });
  }
  if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) {
    return NextResponse.json({ ok: false, error: "Provide a quality rating from 1 to 5." }, { status: 400 });
  }

  const { id } = await params;
  const task = await prisma.task.findFirst({
    where: { id, projectId: COMPANY_TASK_PROJECT_ID, status: TaskStatus.SUBMITTED_FOR_REVIEW },
    select: {
      id: true, title: true, status: true, assigneeId: true,
      submissions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, submittedById: true } },
    },
  });
  const submission = task?.submissions[0];
  if (!task || !submission || !task.assigneeId) {
    return NextResponse.json({ ok: false, error: "No pending submission was found for this task." }, { status: 404 });
  }
  if (submission.submittedById === reviewer.id) {
    return NextResponse.json({ ok: false, error: "You cannot review your own submission." }, { status: 403 });
  }

  if (reviewer.role === UserRole.MANAGER) {
    const managesAssignee = await prisma.teamMembership.findFirst({
      where: {
        userId: reviewer.id,
        role: "MANAGER",
        team: { memberships: { some: { userId: task.assigneeId } } },
      },
      select: { id: true },
    });
    if (!managesAssignee) {
      return NextResponse.json({ ok: false, error: "This task is outside your team." }, { status: 403 });
    }
  }

  const nextStatus = decision as TaskStatus;
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.updateMany({
      where: { id: task.id, status: TaskStatus.SUBMITTED_FOR_REVIEW },
      data: { status: nextStatus },
    });
    if (!updated.count) return false;
    await tx.taskReview.create({
      data: { submissionId: submission.id, reviewerId: reviewer.id, decision: decision as ReviewDecision, rating: rating as number, feedback },
    });
    await tx.taskStatusHistory.create({
      data: { taskId: task.id, actorId: reviewer.id, fromStatus: TaskStatus.SUBMITTED_FOR_REVIEW, toStatus: nextStatus },
    });
    await tx.notification.create({
      data: {
        userId: task.assigneeId!, actorId: reviewer.id, projectId: COMPANY_TASK_PROJECT_ID, taskId: task.id,
        type: decision === ReviewDecision.APPROVED ? "TASK_APPROVED" : decision === ReviewDecision.REVISION_REQUESTED ? "TASK_REVISION_REQUESTED" : "TASK_REJECTED",
        message: `${reviewer.name || reviewer.email} ${decision === ReviewDecision.APPROVED ? "approved" : decision === ReviewDecision.REVISION_REQUESTED ? "requested changes to" : "rejected"} "${task.title}"`,
        href: "/company-tasks",
      },
    });
    return true;
  });

  if (!result) return NextResponse.json({ ok: false, error: "This submission has already been reviewed." }, { status: 409 });
  return NextResponse.json({ ok: true, status: nextStatus });
}
