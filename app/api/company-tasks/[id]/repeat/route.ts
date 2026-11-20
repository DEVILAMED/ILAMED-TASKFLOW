import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { companyTaskAccessWhere } from "@/lib/company-task-access";
import { firstRepeatWorkday, nextCalendarDay, parseTaskRepeat } from "@/lib/company-task-repeat";
import { employeeDayKey } from "@/lib/company-workdays";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "MANAGER") return NextResponse.json({ ok: false, error: "Manager access is required to manage daily repeat." }, { status: 403 });
  let payload: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    payload = body as Record<string, unknown>;
  } catch { return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 }); }
  if (Object.keys(payload).some(key => !["repeat", "repeatUntil"].includes(key)) || !["DAILY", "NONE"].includes(String(payload.repeat))) {
    return NextResponse.json({ ok: false, error: "Choose daily repeat or stop repeating." }, { status: 400 });
  }
  const repeat = parseTaskRepeat(payload);
  if (!repeat.ok) return NextResponse.json({ ok: false, error: repeat.error }, { status: 400 });
  const { id } = await params;
  try {
    const result = await prisma.$transaction(async tx => {
      const task = await tx.task.findFirst({
        where: { id, projectId: COMPANY_TASK_PROJECT_ID, ...companyTaskAccessWhere(user), archivedAt: null },
        select: { id: true, title: true, description: true, priority: true, assigneeId: true, recurrenceId: true, checklistItems: { orderBy: { position: "asc" }, select: { title: true } } },
      });
      if (!task) return { status: 404, error: "Task not found or access denied." };
      if (!repeat.daily) {
        if (task.recurrenceId) await tx.companyTaskRecurrence.update({ where: { id: task.recurrenceId }, data: { isActive: false } });
        return { status: 200 };
      }
      if (task.recurrenceId) return { status: 409, error: "This task already belongs to a daily repeat. Create a new task to set up another schedule." };
      if (!task.assigneeId || !await tx.user.findFirst({ where: { id: task.assigneeId, isBlocked: false, role: { not: "ADMIN" }, OR: [{ employeeProfile: null }, { employeeProfile: { employmentStatus: { not: "INACTIVE" } } }] }, select: { id: true } })) {
        return { status: 400, error: "Assign an active employee before setting up daily repeat." };
      }
      // Keep this task's submissions unchanged; the repeat starts on the next workday.
      const next = nextCalendarDay(employeeDayKey());
      const leave = await tx.employeeLeaveDay.findMany({ where: { employeeId: task.assigneeId, day: { gte: new Date(`${next}T00:00:00Z`) } }, select: { day: true } });
      const firstDay = firstRepeatWorkday(next, repeat.endDate?.toISOString().slice(0, 10) ?? null, leave.map(item => item.day.toISOString().slice(0, 10)));
      if (!firstDay) return { status: 400, error: "The repeat must include at least one working day after today." };
      const startDate = new Date(`${firstDay}T00:00:00Z`);
      const rule = await tx.companyTaskRecurrence.create({ data: {
        title: task.title, description: task.description, priority: task.priority, checklistItems: task.checklistItems.map(item => item.title),
        projectId: COMPANY_TASK_PROJECT_ID, assigneeId: task.assigneeId, createdById: user.id, startDate, nextDate: startDate, endDate: repeat.endDate,
      } });
      await tx.task.update({ where: { id: task.id, recurrenceId: null }, data: { recurrenceId: rule.id } });
      return { status: 200 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: result.status === 200, ...("error" in result ? { error: result.error } : {}) }, { status: result.status });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2025"].includes(error.code)) return NextResponse.json({ ok: false, error: "This task changed. Refresh and try again." }, { status: 409 });
    throw error;
  }
}
