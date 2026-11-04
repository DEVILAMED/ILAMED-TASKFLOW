import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import LogoutButton from "@/app/dashboard/logout-button";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import CompanyTaskBoard from "./company-task-board";
import { CompanyContext } from "./company-context";

export default async function CompanyTasksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");

  const tasks = await prisma.task.findMany({
    where: { projectId: COMPANY_TASK_PROJECT_ID, assigneeId: user.id },
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
  });

  return (
    <WorkspaceShell
      title="My assigned tasks"
      currentWorkspace="projects"
      navItems={[
        { href: "/company-tasks", label: "My tasks", icon: "board", active: true },
        { href: "/reports", label: "Reports", icon: "reports" },
      ]}
      userName={user.name || user.email}
      userEmail={user.email}
      userAction={<LogoutButton />}
    >
      <div className="mx-auto w-full max-w-6xl">
        <section className="panel-card mb-5 rounded-3xl p-5 sm:p-6">
          <p className="section-kicker">About ILAMED</p>
          <CompanyContext />
        </section>
        <CompanyTaskBoard
          isAdmin={false}
          employees={[]}
          initialTasks={tasks.map((task) => ({
            ...task,
            dueDate: task.dueDate?.toISOString() ?? null,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
          }))}
        />
      </div>
    </WorkspaceShell>
  );
}
