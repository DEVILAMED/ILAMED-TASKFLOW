import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessibleProjectWhere, accessibleTaskWhere } from "@/project-access";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (query.length < 2) return NextResponse.json({ ok: true, results: [] });

  const teamMemberships = user.role === UserRole.MANAGER
    ? await prisma.teamMembership.findMany({ where: { userId: user.id, role: "MANAGER" }, select: { teamId: true } })
    : [];
  const companyTaskScope = user.role === UserRole.ADMIN
    ? { projectId: COMPANY_TASK_PROJECT_ID }
    : user.role === UserRole.MANAGER
      ? { OR: [
          { projectId: COMPANY_TASK_PROJECT_ID, assigneeId: user.id },
          ...(teamMemberships.length ? [{ projectId: COMPANY_TASK_PROJECT_ID, assignee: { is: { teamMemberships: { some: { teamId: { in: teamMemberships.map((membership) => membership.teamId) } } } } } }] : []),
        ] }
      : { projectId: COMPANY_TASK_PROJECT_ID, assigneeId: user.id };
  const taskScope = user.role === UserRole.ADMIN
    ? {}
    : { OR: [companyTaskScope, accessibleTaskWhere(user.id)] };

  const departmentScope = user.role === UserRole.ADMIN
    ? undefined
    : await prisma.employeeProfile.findUnique({ where: { userId: user.id }, select: { departmentId: true } }).then(async (profile) => {
        const managed = user.role === UserRole.MANAGER ? await prisma.department.findMany({ where: { headId: user.id }, select: { id: true } }) : [];
        return [...new Set([profile?.departmentId, ...managed.map((department) => department.id)].filter((id): id is string => Boolean(id)))];
      });
  const [tasks, projects, users, departments] = await Promise.all([
    prisma.task.findMany({ where: { AND: [taskScope, { title: { contains: query, mode: "insensitive" } }] }, take: 6, orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }], select: { id: true, title: true, status: true, projectId: true, project: { select: { title: true } } } }),
    prisma.project.findMany({ where: { AND: [{ id: { not: COMPANY_TASK_PROJECT_ID } }, user.role === UserRole.ADMIN ? {} : accessibleProjectWhere(user.id), { title: { contains: query, mode: "insensitive" } }] }, take: 4, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    user.role === UserRole.ADMIN
      ? prisma.user.findMany({ where: { role: { not: UserRole.ADMIN }, OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }, { employeeProfile: { is: { employeeCode: { contains: query, mode: "insensitive" } } } }] }, take: 5, orderBy: [{ name: "asc" }, { email: "asc" }], select: { id: true, name: true, email: true } })
      : user.role === UserRole.MANAGER
        ? prisma.user.findMany({ where: { id: { not: user.id }, role: { not: UserRole.ADMIN }, OR: [{ employeeProfile: { is: { managerId: user.id } } }, { teamMemberships: { some: { teamId: { in: teamMemberships.map((membership) => membership.teamId) } } } }], AND: [{ OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] }] }, take: 5, orderBy: [{ name: "asc" }, { email: "asc" }], select: { id: true, name: true, email: true } })
        : Promise.resolve([]),
    prisma.department.findMany({ where: { AND: [departmentScope === undefined ? {} : { id: { in: departmentScope } }, { name: { contains: query, mode: "insensitive" } }] }, take: 4, orderBy: { name: "asc" }, select: { id: true, name: true, description: true } }),
  ]);

  const results = [
    ...tasks.map((task) => ({ id: `task-${task.id}`, title: task.title, detail: task.project.title, kind: "Task", href: task.projectId === COMPANY_TASK_PROJECT_ID ? (user.role === UserRole.ADMIN ? "/admin" : "/company-tasks") : `/projects/${task.projectId}` })),
    ...projects.map((project) => ({ id: `project-${project.id}`, title: project.title, detail: "Project", kind: "Project", href: `/projects/${project.id}` })),
    ...users.map((person) => ({ id: `employee-${person.id}`, title: person.name || person.email, detail: person.email, kind: "Employee", href: user.role === UserRole.ADMIN ? "/admin#employees" : "/company-tasks" })),
    ...departments.map((department) => ({ id: `department-${department.id}`, title: department.name, detail: department.description || "Department", kind: "Department", href: "/departments" })),
    ...(/report|analytics|performance/i.test(query) ? [{ id: "report-center", title: "Task and performance reports", detail: "Analytics", kind: "Report", href: "/reports" }] : []),
  ].slice(0, 12);
  return NextResponse.json({ ok: true, results });
}
