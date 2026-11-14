import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import CompanyTaskBoard from "@/app/(workspace)/company-tasks/company-task-board";
import WorkspacePageHeading from "@/app/workspace-page-heading";
import { NewTaskButton } from "@/app/new-company-task-dialog";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const calendar = (await searchParams).view === "calendar";
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
  return <>
    <WorkspacePageHeading kicker={calendar ? "SCHEDULE" : "WORKFLOW"} title={calendar ? "Calendar" : "Tasks"} action={<NewTaskButton />} />
    <CompanyTaskBoard isAdmin employees={employees} initialTasks={tasks.map((task) => ({ ...task, dueDate: task.dueDate?.toISOString() ?? null, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() }))} />
  </>;
}
