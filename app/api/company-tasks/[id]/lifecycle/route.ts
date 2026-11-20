import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });
  let action: unknown;
  try { action = (await request.json())?.action; } catch { /* Invalid JSON is rejected below. */ }
  if (action !== "ARCHIVE" && action !== "UNARCHIVE" && action !== "RESTORE") return NextResponse.json({ ok: false, error: "Choose archive, unarchive, or restore." }, { status: 400 });
  const { id } = await params;
  try {
    const result = await prisma.$transaction(async tx => {
      const task = await tx.task.findFirst({
        where: { id, projectId: COMPANY_TASK_PROJECT_ID, deletedAt: action === "RESTORE" ? { not: null } : null },
        select: { id: true, status: true, archivedAt: true, deletedAt: true, updatedAt: true },
      });
      if (!task) return { ok: false, error: "Task not found.", status: 404 };
      if (action === "ARCHIVE" && !["APPROVED", "DONE", "CANCELLED", "REJECTED"].includes(task.status)) return { ok: false, error: "Only completed, cancelled, or rejected tasks can be archived.", status: 409 };
      const data = action === "RESTORE" ? { deletedAt: null } : { archivedAt: action === "ARCHIVE" ? new Date() : null };
      const updated = await tx.task.update({ where: { id, updatedAt: task.updatedAt, deletedAt: task.deletedAt }, data, select: { archivedAt: true, deletedAt: true } });
      await tx.taskChange.create({ data: { taskId: id, actorId: user.id, action,
        before: { archivedAt: task.archivedAt?.toISOString() ?? null, deletedAt: task.deletedAt?.toISOString() ?? null },
        after: { archivedAt: updated.archivedAt?.toISOString() ?? null, deletedAt: updated.deletedAt?.toISOString() ?? null },
      } });
      return { ok: true, status: 200 };
    });
    return NextResponse.json(result, { status: result.status });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) return NextResponse.json({ ok: false, error: "The task changed. Refresh and try again." }, { status: 409 });
    throw error;
  }
}
