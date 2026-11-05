import { NextResponse } from "next/server";
import { EmploymentStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (actor.role !== UserRole.ADMIN) return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 }); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  const payload = raw as Record<string, unknown>;
  const allowed = new Set(["employeeCode", "phone", "designation", "joiningDate", "employmentStatus", "departmentId", "managerId"]);
  if (Object.keys(payload).some((key) => !allowed.has(key)) || !Object.keys(payload).length) return NextResponse.json({ ok: false, error: "Unsupported or empty employee profile update." }, { status: 400 });
  const userId = (await params).id;
  const employee = await prisma.user.findFirst({ where: { id: userId, role: { not: UserRole.ADMIN } }, select: { id: true } });
  if (!employee) return NextResponse.json({ ok: false, error: "Employee account not found." }, { status: 404 });

  const data: {
    employeeCode?: string | null; phone?: string | null; designation?: string | null;
    joiningDate?: Date | null; employmentStatus?: EmploymentStatus;
    departmentId?: string | null; managerId?: string | null;
  } = {};
  for (const key of ["employeeCode", "phone", "designation"] as const) {
    if (!(key in payload)) continue;
    const value = payload[key];
    if (value !== null && typeof value !== "string") return NextResponse.json({ ok: false, error: `Enter a valid ${key}.` }, { status: 400 });
    const normalized = typeof value === "string" ? value.trim() : "";
    const max = key === "phone" ? 40 : key === "designation" ? 100 : 40;
    if (normalized.length > max) return NextResponse.json({ ok: false, error: `${key} must be ${max} characters or fewer.` }, { status: 400 });
    data[key] = normalized || null;
  }
  if ("joiningDate" in payload) {
    if (payload.joiningDate === null || payload.joiningDate === "") data.joiningDate = null;
    else if (typeof payload.joiningDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.joiningDate) || Number.isNaN(Date.parse(`${payload.joiningDate}T00:00:00Z`)) || new Date(`${payload.joiningDate}T00:00:00Z`).toISOString().slice(0, 10) !== payload.joiningDate) return NextResponse.json({ ok: false, error: "Enter a valid joining date." }, { status: 400 });
    else data.joiningDate = new Date(`${payload.joiningDate}T00:00:00Z`);
  }
  if ("employmentStatus" in payload) {
    if (typeof payload.employmentStatus !== "string" || !Object.values(EmploymentStatus).includes(payload.employmentStatus as EmploymentStatus)) return NextResponse.json({ ok: false, error: "Choose a valid employment status." }, { status: 400 });
    data.employmentStatus = payload.employmentStatus as EmploymentStatus;
  }
  for (const key of ["departmentId", "managerId"] as const) {
    if (!(key in payload)) continue;
    const value = payload[key];
    if (value !== null && (typeof value !== "string" || !value.trim())) return NextResponse.json({ ok: false, error: `Choose a valid ${key}.` }, { status: 400 });
    const id = typeof value === "string" ? value.trim() : null;
    if (id && key === "departmentId" && !await prisma.department.findUnique({ where: { id }, select: { id: true } })) return NextResponse.json({ ok: false, error: "Department not found." }, { status: 400 });
    if (id && key === "managerId" && (id === userId || !await prisma.user.findFirst({ where: { id, role: { not: UserRole.ADMIN }, isBlocked: false }, select: { id: true } }))) return NextResponse.json({ ok: false, error: "Choose another active employee as reporting manager." }, { status: 400 });
    data[key] = id;
  }
  try {
    const profile = await prisma.$transaction(async (tx) => {
      const saved = await tx.employeeProfile.upsert({
        where: { userId }, create: { userId, ...data }, update: data,
        include: { department: { select: { id: true, name: true } }, manager: { select: { id: true, name: true, email: true } } },
      });
      if (data.employmentStatus === EmploymentStatus.INACTIVE) {
        await tx.user.update({ where: { id: userId }, data: { isBlocked: true } });
        await tx.session.deleteMany({ where: { userId } });
      }
      return saved;
    });
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ ok: false, error: "That employee ID is already in use." }, { status: 409 });
    throw error;
  }
}
