import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, description: true, headId: true,
      head: { select: { name: true, email: true } },
      _count: { select: { employees: true } },
    },
  });
  return NextResponse.json({ ok: true, departments });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (user.role !== UserRole.ADMIN) return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 }); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  const payload = raw as { name?: unknown; description?: unknown; headId?: unknown };
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const description = typeof payload.description === "string" ? payload.description.trim() : "";
  const headId = typeof payload.headId === "string" && payload.headId ? payload.headId : null;
  if (name.length < 2 || name.length > 100 || description.length > 500) {
    return NextResponse.json({ ok: false, error: "Department name must be 2–100 characters; description must be 500 characters or fewer." }, { status: 400 });
  }
  if (headId && !await prisma.user.findFirst({ where: { id: headId, role: { not: UserRole.ADMIN }, isBlocked: false }, select: { id: true } })) {
    return NextResponse.json({ ok: false, error: "Choose an active employee as department head." }, { status: 400 });
  }
  try {
    const department = await prisma.department.create({ data: { name, description: description || null, headId } });
    return NextResponse.json({ ok: true, department }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ ok: false, error: "A department with that name already exists." }, { status: 409 });
    throw error;
  }
}
