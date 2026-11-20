import { companyTaskSnapshot } from "@/lib/company-task-series";
import { companyTaskRepeatSelect } from "@/lib/company-task-repeat";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmployeePresence from "../employee-presence";
import WorkspacePageHeading from "@/app/workspace-page-heading";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import { withAvatarUrl } from "@/lib/user-avatar";
import { getEmployeeLeave } from "@/services/employee-leave";
import { employeeDayKey } from "@/lib/employee-dashboard";
import AdminDepartmentSwitcher from "@/app/admin-department-switcher";
import { matchesDepartment, resolveDepartmentFilter } from "@/lib/employee-departments";
import { ensureDailyCompanyTasks } from "@/services/recurring-company-tasks";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ department?: string | string[] }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") redirect("/dashboard");
  await ensureDailyCompanyTasks();
  const [userRows, departments, taskRows] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, avatar: true, role: true, isBlocked: true, createdAt: true, lastSeenAt: true,
        employeeProfile: { select: { employeeCode: true, phone: true, designation: true, joiningDate: true, employmentStatus: true, departmentId: true, managerId: true } },
      },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.task.findMany({ where: { projectId: COMPANY_TASK_PROJECT_ID }, select: { ...companyTaskRepeatSelect, id: true, dueDate: true, assigneeId: true, status: true } }),
  ]);
  const selectedDepartment = resolveDepartmentFilter((await searchParams).department, departments);
  const allUsers = userRows.map(withAvatarUrl);
  const users = allUsers.filter(user => user.role === "ADMIN" || matchesDepartment(user.employeeProfile?.departmentId, selectedDepartment));
  const today = employeeDayKey();
  const leaveByEmployee = await getEmployeeLeave(users.map(user => user.id));
  return <div className="workspace-view">
    <WorkspacePageHeading kicker="ROSTER" title="Team" description="Find a team member and open their profile to view work or manage their account." />
    <AdminDepartmentSwitcher departments={departments} selectedDepartment={selectedDepartment} />
    <section className="workspace-surface" aria-label="Team members">
      <EmployeePresence
        key={selectedDepartment}
        currentUserId={currentUser.id}
        today={today}
        employees={users.map(employee => {
          const assigned = companyTaskSnapshot(taskRows.filter(task => task.assigneeId === employee.id));
          return {
            ...employee,
            leaveDays: leaveByEmployee[employee.id] ?? [],
            createdAt: employee.createdAt.toISOString(),
            lastSeenAt: employee.lastSeenAt?.toISOString() ?? null,
            profile: employee.employeeProfile ? { ...employee.employeeProfile, joiningDate: employee.employeeProfile.joiningDate?.toISOString().slice(0, 10) ?? null } : null,
            taskSummary: {
              assigned: assigned.length,
              completed: assigned.filter(task => ["APPROVED", "DONE"].includes(task.status)).length,
              pending: assigned.filter(task => !["APPROVED", "DONE", "REJECTED", "CANCELLED"].includes(task.status)).length,
            },
          };
        })}
        departments={departments}
        managers={allUsers.filter(employee => employee.role !== "ADMIN" && !employee.isBlocked).map(({ id, name, email }) => ({ id, name, email }))}
      />
    </section>
  </div>;
}
