import { NextResponse } from "next/server";
import { UserRole, type Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const url = new URL(request.url);
  const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("pageSize") || "25", 10) || 25));
  const search = (url.searchParams.get("search") || "").trim().slice(0, 100);
  const departmentId = url.searchParams.get("departmentId");
  const status = url.searchParams.get("employmentStatus");
  const clauses: Prisma.UserWhereInput[] = [];
  if (user.role === UserRole.ADMIN) {
    clauses.push({ role: { not: UserRole.ADMIN } });
  } else if (user.role === UserRole.MANAGER) {
    const memberships = await prisma.teamMembership.findMany({ where: { userId: user.id, role: "MANAGER" }, select: { teamId: true } });
    clauses.push({ OR: [
      { employeeProfile: { is: { managerId: user.id } } },
      { headedDepartments: { some: { employees: { some: { userId: { not: user.id } } } } } },
      ...(memberships.length ? [{ teamMemberships: { some: { teamId: { in: memberships.map((membership) => membership.teamId) } } } }] : []),
    ] });
  } else {
    clauses.push({ id: user.id });
  }
  if (search) clauses.push({ OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, { employeeProfile: { is: { employeeCode: { contains: search, mode: "insensitive" } } } }] });
  if (departmentId) clauses.push({ employeeProfile: { is: { departmentId } } });
  if (status && ["ACTIVE", "INACTIVE", "ON_LEAVE"].includes(status)) clauses.push({ employeeProfile: { is: { employmentStatus: status as "ACTIVE" | "INACTIVE" | "ON_LEAVE" } } });
  const where: Prisma.UserWhereInput = { AND: clauses };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where, orderBy: [{ name: "asc" }, { email: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, name: true, email: true, role: true,
        employeeProfile: { select: {
          employeeCode: true, phone: true, designation: true, joiningDate: true, employmentStatus: true,
          department: { select: { id: true, name: true } }, manager: { select: { id: true, name: true, email: true } },
        } },
      },
    }),
  ]);
  return NextResponse.json({ ok: true, users: users.map((item) => ({ ...item, employeeProfile: item.employeeProfile ? { ...item.employeeProfile, joiningDate: item.employeeProfile.joiningDate?.toISOString().slice(0, 10) ?? null } : null })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
}
