import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import LogoutButton from "@/app/dashboard/logout-button";
import EmployeePresence from "./employee-presence";
import CompanyTaskBoard from "@/app/company-tasks/company-task-board";
import { CompanyContext } from "@/app/company-tasks/company-context";

export default async function AdminPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") redirect("/company-tasks");

  const [users, tasks] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "ADMIN" } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true, isBlocked: true, createdAt: true, lastSeenAt: true },
    }),
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
        assignee: { select: { id: true, name: true, email: true } },
        checklistItems: {
          orderBy: { position: "asc" },
          select: { id: true, title: true, isCompleted: true, position: true },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  const employees = users.map(({ id, name, email }) => ({ id, name, email }));

  return (
    <WorkspaceShell
      title="Company tasks"
      currentWorkspace="projects"
      navItems={[
        { href: "/admin", label: "Tasks", icon: "board", active: true },
        { href: "/reports", label: "Reports", icon: "reports" },
        { href: "#employees", label: "Employees", icon: "team", badge: String(users.length) },
      ]}
      userName={currentUser.name || currentUser.email}
      userEmail={currentUser.email}
      userAction={<LogoutButton />}
      topbarRight={<span className="badge-pill text-xs text-[var(--accent)]">Administrator</span>}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="panel-card rounded-3xl p-5 sm:p-7">
          <p className="section-kicker">Task tracking</p>
          <h2 className="display-font mt-3 text-4xl text-white/95">Assign work. Track progress.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
            Assign each task to an employee, set an optional due date, and follow its status from one list.
          </p>
          <CompanyContext />
        </section>

        <CompanyTaskBoard
          isAdmin
          employees={employees}
          initialTasks={tasks.map((task) => ({
            ...task,
            dueDate: task.dueDate?.toISOString() ?? null,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
          }))}
        />

        <section id="employees" className="panel-card rounded-3xl p-5 sm:p-7">
          <div className="mb-4">
            <p className="section-kicker">People</p>
            <h2 className="mt-2 text-xl font-semibold text-white/90">Employees</h2>
            <p className="mt-1 text-sm text-white/45">Employee accounts can view their assigned tasks and update progress.</p>
          </div>
          {users.length ? (
            <EmployeePresence
              employees={users.map((employee) => ({
                ...employee,
                createdAt: employee.createdAt.toISOString(),
                lastSeenAt: employee.lastSeenAt?.toISOString() ?? null,
              }))}
            />
          ) : (
            <p className="text-sm text-white/45">No employee accounts yet. Employees can create accounts to receive assigned tasks.</p>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
