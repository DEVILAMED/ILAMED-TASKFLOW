import { redirect } from "next/navigation";
import Link from "next/link";
import { WorkspaceShell } from "@/app/workspace-shell";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import LogoutButton from "@/app/dashboard/logout-button";
import CompanyTaskBoard from "@/app/company-tasks/company-task-board";

export default async function AdminPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") redirect("/dashboard");
  const [employees, tasks] = await Promise.all([
    prisma.user.findMany({ where: { role: { not: "ADMIN" }, isBlocked: false, OR: [{ employeeProfile: null }, { employeeProfile: { employmentStatus: { not: "INACTIVE" } } }] }, orderBy: [{ name: "asc" }, { email: "asc" }], select: { id: true, name: true, email: true } }),
    prisma.task.findMany({
      where: { projectId: COMPANY_TASK_PROJECT_ID },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        assignee: { select: { id: true, name: true, email: true, employeeProfile: { select: { departmentId: true } } } },
        checklistItems: {
          orderBy: { position: "asc" },
          select: { id: true, title: true, isCompleted: true, position: true },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    })
  ]);
  return <WorkspaceShell title="Company tasks" currentWorkspace="projects" navItems={[
        { href: "/admin", label: "Tasks", icon: "board", active: true },
        { href: "/admin/overview", label: "Company overview", icon: "dashboard" },
        { href: "/reviews", label: "Reviews", icon: "activity" },
        { href: "/admin/employees", label: "Employees", icon: "team" },
        { href: "/departments", label: "Departments", icon: "team" },
        { href: "/reports", label: "Reports", icon: "reports" },
  ]} userName={currentUser.name || currentUser.email} userEmail={currentUser.email} userAction={<LogoutButton />}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Company work</h2><p className="mt-1 text-sm text-[var(--muted)]">Assign work, review blockers, and keep tasks moving.</p></div><Link href="/reports" className="secondary-button px-3 py-2 text-sm">View reports</Link></div>
    <CompanyTaskBoard isAdmin employees={employees} initialTasks={tasks.map((task) => ({ ...task, dueDate: task.dueDate?.toISOString() ?? null, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() }))} />
  </WorkspaceShell>;
}
