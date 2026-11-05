import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (user.role !== UserRole.ADMIN) return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 }); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  const payload = raw as { name?: unknown; description?: unknown; headId?: unknown };
  const data: { name?: string; description?: string | null; headId?: string | null } = {};
  if ("name" in payload) {
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (name.length < 2 || name.length > 100) return NextResponse.json({ ok: false, error: "Department name must be 2–100 characters." }, { status: 400 });
    data.name = name;
  }
  if ("description" in payload) {
    if (typeof payload.description !== "string" && payload.description !== null) return NextResponse.json({ ok: false, error: "Enter a valid description." }, { status: 400 });
    const description = typeof payload.description === "string" ? payload.description.trim() : "";
    if (description.length > 500) return NextResponse.json({ ok: false, error: "Description must be 500 characters or fewer." }, { status: 400 });
    data.description = description || null;
  }
  if ("headId" in payload) {
    const headId = typeof payload.headId === "string" && payload.headId ? payload.headId : null;
    if (headId && !await prisma.user.findFirst({ where: { id: headId, role: { not: UserRole.ADMIN }, isBlocked: false }, select: { id: true } })) {
      return NextResponse.json({ ok: false, error: "Choose an active employee as department head." }, { status: 400 });
    }
    data.headId = headId;
  }
  if (!Object.keys(data).length) return NextResponse.json({ ok: false, error: "No department changes were provided." }, { status: 400 });
  try {
    const department = await prisma.department.update({ where: { id: (await params).id }, data });
    return NextResponse.json({ ok: true, department });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") return NextResponse.json({ ok: false, error: "Department not found." }, { status: 404 });
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ ok: false, error: "A department with that name already exists." }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (user.role !== UserRole.ADMIN) return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });
  const id = (await params).id;
  const department = await prisma.department.findUnique({ where: { id }, select: { id: true, _count: { select: { employees: true } } } });
  if (!department) return NextResponse.json({ ok: false, error: "Department not found." }, { status: 404 });
  if (department._count.employees) return NextResponse.json({ ok: false, error: "Move employees to another department before deleting this department." }, { status: 409 });
  await prisma.department.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
