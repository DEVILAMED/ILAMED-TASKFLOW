import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import LogoutButton from "@/app/dashboard/logout-button";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DepartmentManager from "./department-manager";

export default async function DepartmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") {
    const [profile, managedDepartments] = await Promise.all([
      prisma.employeeProfile.findUnique({ where: { userId: user.id }, select: { departmentId: true } }),
      user.role === "MANAGER" ? prisma.department.findMany({ where: { headId: user.id }, select: { id: true } }) : Promise.resolve([]),
    ]);
    const ids = [...new Set([profile?.departmentId, ...managedDepartments.map((department) => department.id)].filter((id): id is string => Boolean(id)))];
    const departments = await prisma.department.findMany({ where: { id: { in: ids } }, orderBy: { name: "asc" }, select: {
      id: true, name: true, description: true,
      head: { select: { name: true } },
      employees: { where: { employmentStatus: "ACTIVE" }, orderBy: { user: { name: "asc" } }, select: { designation: true, user: { select: { id: true, name: true } } } },
    } });
    return <WorkspaceShell title="My department" currentWorkspace="projects" navItems={[
      ...(user.role === "MANAGER" ? [{ href: "/manager", label: "Team overview", icon: "dashboard" as const }] : []),
      { href: "/company-tasks", label: "My tasks", icon: "board" },
      { href: "/departments", label: "My department", icon: "team", active: true },
      { href: "/reports", label: "Reports", icon: "reports" },
    ]} userName={user.name || user.email} userEmail={user.email} userAction={<LogoutButton />}>
      <div className="mx-auto w-full max-w-5xl"><section className="mb-5"><p className="text-sm font-medium text-[var(--accent)]">Organization</p><h2 className="mt-1 text-2xl font-semibold text-[var(--foreground)]">My department</h2><p className="mt-1 text-sm text-[var(--muted)]">Your department details and active colleagues.</p></section>
        {departments.length ? <div className="grid gap-4 md:grid-cols-2">{departments.map((department) => <article key={department.id} className="panel-card rounded-2xl p-5"><div><h3 className="text-lg font-semibold text-[var(--foreground)]">{department.name}</h3>{department.description ? <p className="mt-1 text-sm text-[var(--muted)]">{department.description}</p> : null}<p className="mt-3 text-xs text-[var(--muted)]">Department head: {department.head?.name || "Not assigned"}</p></div><div className="mt-4 border-t border-[var(--stroke)] pt-3"><h4 className="text-xs font-semibold text-[var(--foreground)]">Active colleagues <span className="font-normal text-[var(--muted)]">({department.employees.length})</span></h4><div className="mt-2 grid gap-2">{department.employees.map((employee) => <div key={employee.user.id} className="flex items-center gap-2 text-sm"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-[10px] font-semibold text-indigo-700">{(employee.user.name || "?").slice(0, 1).toUpperCase()}</span><span className="text-[var(--foreground)]">{employee.user.name || "Employee"}</span><span className="ml-auto text-xs text-[var(--muted)]">{employee.designation || ""}</span></div>)}</div></div></article>)}</div> : <div className="panel-card rounded-2xl p-6 text-sm text-[var(--muted)]">No department has been assigned to your employee profile yet.</div>}
      </div>
    </WorkspaceShell>;
  }
  const [departments, employees] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, description: true, headId: true, head: { select: { name: true, email: true } }, _count: { select: { employees: true } } } }),
    prisma.user.findMany({ where: { role: { not: "ADMIN" }, isBlocked: false }, orderBy: [{ name: "asc" }, { email: "asc" }], select: { id: true, name: true, email: true } }),
  ]);
  return <WorkspaceShell title="Departments" currentWorkspace="projects" navItems={[
    { href: "/admin", label: "Tasks", icon: "board" },
    { href: "/reviews", label: "Reviews", icon: "reports" },
    { href: "/departments", label: "Departments", icon: "team", active: true },
    { href: "/reports", label: "Reports", icon: "reports" },
  ]} userName={user.name || user.email} userEmail={user.email} userAction={<LogoutButton />} topbarRight={<span className="badge-pill text-xs text-[var(--accent)]">Administrator</span>}>
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5"><section className="panel-card rounded-3xl p-5 sm:p-7"><p className="section-kicker">Organization</p><h1 className="display-font mt-2 text-3xl text-white/95">Departments</h1><p className="mt-2 text-sm text-white/50">Organize employee profiles and assign a department head.</p></section><DepartmentManager initialDepartments={departments} employees={employees} /></div>
  </WorkspaceShell>;
}
