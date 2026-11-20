import { companyTaskSnapshot } from "@/lib/company-task-series";
import { companyTaskRepeatSelect } from "@/lib/company-task-repeat";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmployeePresence from "../employee-presence";
import Link from "next/link";
import WorkspacePageHeading from "@/app/workspace-page-heading";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import { getReviewPeriod, MIN_REVIEWED_TASKS, summarizeReviewQuality } from "@/lib/review-quality";
import { getReviewEvidence } from "@/services/review-quality";
import ReviewQualityBadge from "@/app/review-quality-badge";
import UserAvatar from "@/app/user-avatar";
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
  const period = getReviewPeriod();
  const [userRows, departments, taskRows, reviews] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, avatar: true, role: true, isBlocked: true, createdAt: true, lastSeenAt: true,
        employeeProfile: { select: { employeeCode: true, phone: true, designation: true, joiningDate: true, employmentStatus: true, departmentId: true, managerId: true } },
      },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.task.findMany({ where: { projectId: COMPANY_TASK_PROJECT_ID }, select: { ...companyTaskRepeatSelect, id: true, dueDate: true, assigneeId: true, status: true } }),
    getReviewEvidence(period),
  ]);
  const selectedDepartment = resolveDepartmentFilter((await searchParams).department, departments);
  const allUsers = userRows.map(withAvatarUrl);
  const users = allUsers.filter(user => user.role === "ADMIN" || matchesDepartment(user.employeeProfile?.departmentId, selectedDepartment));
  const teamMembers = users.filter((user) => user.role !== "ADMIN");
  const today = employeeDayKey();
  const leaveByEmployee = await getEmployeeLeave(teamMembers.map(user => user.id));
  const qualityByEmployee = new Map(summarizeReviewQuality(reviews, period, leaveByEmployee).employees.map(person => [person.employeeId, person]));
  return <>
    <div className="workspace-view"><WorkspacePageHeading kicker="ROSTER" title="Team" description={`Review quality: ${period.label.toLowerCase()} (${period.startDay} to ${period.endDay}, India time). At least ${MIN_REVIEWED_TASKS} distinct reviewed tasks per employee; task totals show current assignments.`} />
      <AdminDepartmentSwitcher departments={departments} selectedDepartment={selectedDepartment} />
      <section className="workspace-team-grid" aria-label="Team members">{teamMembers.map(employee => {
        const assigned = companyTaskSnapshot(taskRows.filter(task => task.assigneeId === employee.id));
        const done = assigned.filter(task => ["APPROVED","DONE"].includes(task.status)).length;
        const pending = assigned.filter(task => !["APPROVED","DONE","REJECTED","CANCELLED"].includes(task.status)).length;
        const quality = qualityByEmployee.get(employee.id);
        const name = employee.name || employee.email;
        return <Link key={employee.id} href={`/performance?employee=${encodeURIComponent(employee.id)}`} className="workspace-surface workspace-team-card"><div className="workspace-team-person"><UserAvatar name={name} src={employee.avatarUrl} size={46} className="workspace-team-avatar" /><div><h2>{name}</h2><p>{employee.employeeProfile?.designation || (employee.role === "MANAGER" ? "Team manager" : "Team member")}</p><p>{departments.find(department => department.id === employee.employeeProfile?.departmentId)?.name || "Unassigned department"}</p></div><ReviewQualityBadge score={quality?.score ?? null} ratedTaskCount={quality?.ratedTaskCount ?? 0} /></div><div className="workspace-team-counts">{[[assigned.length,"Tasks"],[done,"Done"],[pending,"Pending"],[quality?.ratedTaskCount ?? 0,"Reviewed"]].map(([value,label])=><div key={String(label)}><strong>{value}</strong><span>{label}</span></div>)}</div></Link>;
      })}</section>{!teamMembers.length ? <div className="workspace-empty-panel">No employees in this department view. Switch departments or assign employees below.</div> : null}
    </div>
    <details className="workspace-additional" open><summary>Manage user accounts</summary>
        <section id="employees" className="panel-card rounded-3xl p-5 sm:p-7">
          <div className="mb-4">
            <p className="section-kicker">People</p>
            <h2 className="mt-2 text-xl font-semibold text-white/90">{selectedDepartment === "ALL" ? "All registered users" : "Department employees and administrators"}</h2>
            <p className="mt-1 text-sm text-white/45">Change other administrators to users. Manage employee and manager account details, roles, login access, and profiles.</p>
          </div>
          {users.length ? (
            <EmployeePresence
              key={selectedDepartment}
              currentUserId={currentUser.id}
              today={today}
              employees={users.map((employee) => ({
                ...employee,
                leaveDays: leaveByEmployee[employee.id] ?? [],
                createdAt: employee.createdAt.toISOString(),
                lastSeenAt: employee.lastSeenAt?.toISOString() ?? null,
                profile: employee.employeeProfile ? { ...employee.employeeProfile, joiningDate: employee.employeeProfile.joiningDate?.toISOString().slice(0, 10) ?? null } : null,
              }))}
              departments={departments}
              managers={allUsers.filter((employee) => employee.role !== "ADMIN" && !employee.isBlocked).map(({ id, name, email }) => ({ id, name, email }))}
            />
          ) : (
            <p className="text-sm text-white/45">No registered user accounts found.</p>
          )}
        </section>

    </details>
  </>;
}
