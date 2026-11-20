import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { companyTaskAccessWhere } from "@/lib/company-task-access";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const task = await prisma.task.findFirst({ where: { id, projectId: COMPANY_TASK_PROJECT_ID, ...companyTaskAccessWhere(user) }, select: { id: true } });
  if (!task) return NextResponse.json({ ok: false, error: "Task not found or access denied." }, { status: 404 });
  const rawPage = Number(new URL(request.url).searchParams.get("page") || 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10000) : 1;
  const changes = await prisma.taskChange.findMany({ where: { taskId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 51,
    select: { id: true, action: true, before: true, after: true, createdAt: true, actor: { select: { name: true, email: true } } },
  });
  return NextResponse.json({ ok: true, changes: changes.slice(0, 50), hasMore: changes.length > 50 }, { headers: { "Cache-Control": "private, no-store" } });
}
