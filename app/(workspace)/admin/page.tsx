import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import CompanyTaskBoard from "@/app/(workspace)/company-tasks/company-task-board";
import WorkspacePageHeading from "@/app/workspace-page-heading";
import { NewTaskButton } from "@/app/new-company-task-dialog";
import { USER_IDENTITY_SELECT, withAvatarUrl } from "@/lib/user-avatar";
import { getEmployeeLeave } from "@/services/employee-leave";
import AdminDepartmentSwitcher from "@/app/admin-department-switcher";
import { departmentEmployeeWhere, departmentTaskWhere, resolveDepartmentFilter } from "@/lib/employee-departments";
import { companyTaskRepeatSelect, serializeTaskRepeat } from "@/lib/company-task-repeat";
import { ensureDailyCompanyTasks } from "@/services/recurring-company-tasks";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ view?: string; department?: string | string[] }> }) {
  const params = await searchParams;
  const calendar = params.view === "calendar";
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") redirect("/dashboard");
  await ensureDailyCompanyTasks();
  const departments = await prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const selectedDepartment = resolveDepartmentFilter(params.department, departments);
  const [employees, tasks] = await Promise.all([
    prisma.user.findMany({ where: { role: { not: "ADMIN" }, isBlocked: false, OR: [{ employeeProfile: null }, { employeeProfile: { employmentStatus: { not: "INACTIVE" } } }], AND: [departmentEmployeeWhere(selectedDepartment)] }, orderBy: [{ name: "asc" }, { email: "asc" }], select: { id: true, name: true, email: true } }),
    prisma.task.findMany({
      where: { projectId: COMPANY_TASK_PROJECT_ID, ...departmentTaskWhere(selectedDepartment) },
      select: {
        ...companyTaskRepeatSelect,
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        startDate: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        assignee: { select: { ...USER_IDENTITY_SELECT, employeeProfile: { select: { departmentId: true } } } },
        assignedBy: { select: { id: true, name: true, email: true } },
        checklistItems: {
          orderBy: { position: "asc" },
          select: { id: true, title: true, isCompleted: true, position: true },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    })
  ]);
  const leaveByEmployee = await getEmployeeLeave([...employees.map(employee => employee.id), ...tasks.flatMap(task => task.assignee ? [task.assignee.id] : [])]);
  return <>
    <WorkspacePageHeading kicker={calendar ? "SCHEDULE" : "WORKFLOW"} title={calendar ? "Calendar" : "Tasks"} action={<NewTaskButton />} />
    <AdminDepartmentSwitcher departments={departments} selectedDepartment={selectedDepartment} />
    <CompanyTaskBoard isAdmin employees={employees} leaveByEmployee={leaveByEmployee} initialTasks={tasks.map((task) => ({ ...serializeTaskRepeat(task), assignee: task.assignee ? withAvatarUrl(task.assignee) : null, startDate: task.startDate?.toISOString() ?? null, dueDate: task.dueDate?.toISOString() ?? null, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() }))} />
  </>;
}
