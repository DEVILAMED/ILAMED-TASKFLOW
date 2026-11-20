import { companyTaskSnapshot } from "@/lib/company-task-series";
import UserProfileManagement from "@/app/user-profile-management";
import { employeeDayKey } from "@/lib/company-workdays";
import TeamMemberDetails from "@/app/team-member-details";
import TeamMemberTasks from "@/app/team-member-tasks";
import { companyTaskRepeatSelect, serializeTaskRepeat } from "@/lib/company-task-repeat";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { companyReportingEmployeeIds } from "@/services/workspace-reporting";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import { getReviewEvidence } from "@/services/review-quality";
import { getReviewPeriod, summarizeReviewQuality } from "@/lib/review-quality";
import PerformanceView from "@/app/performance-view";
import { USER_IDENTITY_SELECT, userAvatarUrl } from "@/lib/user-avatar";
import { getEmployeeLeave } from "@/services/employee-leave";
import { ensureDailyCompanyTasks } from "@/services/recurring-company-tasks";

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ employee?: string; period?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await ensureDailyCompanyTasks();
  const params = await searchParams;
  const memberIds = await companyReportingEmployeeIds(user);
  const personal = user.role === "USER";
  const target = personal ? user.id : params.employee;
  if (target && memberIds && !memberIds.includes(target)) notFound();
  const period = getReviewPeriod(params.period);
  const employeeIds = target ? [target] : memberIds;
  const [tasks, reviews, employee, memberTasks] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: COMPANY_TASK_PROJECT_ID, ...(employeeIds === undefined ? {} : { assigneeId: { in: employeeIds } }) },
      select: { ...companyTaskRepeatSelect, id: true, status: true, priority: true, startDate: true, dueDate: true, assigneeId: true },
    }),
    getReviewEvidence(period, employeeIds),
    target ? prisma.user.findUnique({ where: { id: target }, select: {
      ...USER_IDENTITY_SELECT, role: true, isBlocked: true, createdAt: true, lastSeenAt: true,
      employeeProfile: { select: {
        employeeCode: true, phone: true, designation: true, joiningDate: true, employmentStatus: true, departmentId: true, managerId: true,
        department: { select: { name: true } }, manager: { select: { name: true, email: true } },
      } },
      teamMemberships: { select: { role: true, team: { select: { id: true, name: true } } } },
    } }) : null,
    target ? prisma.task.findMany({
      where: { projectId: COMPANY_TASK_PROJECT_ID, assigneeId: target },
      select: {
        ...companyTaskRepeatSelect, id: true, title: true, description: true, status: true, priority: true, startDate: true, dueDate: true, assigneeId: true, createdAt: true, updatedAt: true,
        assignedBy: { select: { name: true, email: true } },
        checklistItems: { orderBy: { position: "asc" }, select: { id: true, title: true, isCompleted: true } },
        comments: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, content: true, createdAt: true, user: { select: { name: true, email: true } } } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }) : [],
  ]);
  if (target && !employee) notFound();
  const managementOptions = user.role === "ADMIN" && employee ? await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { role: { not: "ADMIN" }, isBlocked: false }, orderBy: [{ name: "asc" }, { email: "asc" }], select: { id: true, name: true, email: true } }),
  ]) : null;
  const leaveByEmployee = await getEmployeeLeave([
    ...(employeeIds ?? []),
    ...tasks.flatMap(task => task.assigneeId ? [task.assigneeId] : []),
    ...reviews.map(review => review.employeeId),
  ]);
  return <PerformanceView personal={personal} employee={target} period={period} leaveByEmployee={leaveByEmployee} quality={summarizeReviewQuality(reviews, period, leaveByEmployee)}
    title={employee ? employee.name || employee.email : "Team Performance"}
    avatarUrl={employee ? userAvatarUrl(employee.id, employee.avatar) : null}
    description={employee ? employee.employeeProfile?.designation || "Profile, assigned work, and review quality." : "Manager review quality and current task activity."}
    memberDetails={employee ? <>
      <TeamMemberDetails employee={employee} leaveDays={leaveByEmployee[employee.id] ?? []} backHref={user.role === "ADMIN" ? "/admin/employees" : user.role === "MANAGER" ? "/manager" : "/dashboard"} />
      {managementOptions ? <UserProfileManagement key={`${employee.id}:${employee.role}`} currentUserId={user.id} today={employeeDayKey()}
        departments={managementOptions[0]} managers={managementOptions[1]} leaveDays={leaveByEmployee[employee.id] ?? []}
        account={{ id: employee.id, name: employee.name, email: employee.email, role: employee.role, isBlocked: employee.isBlocked,
          avatarUrl: userAvatarUrl(employee.id, employee.avatar),
          profile: employee.employeeProfile ? { ...employee.employeeProfile, joiningDate: employee.employeeProfile.joiningDate?.toISOString().slice(0, 10) ?? null } : null,
        }} /> : null}
      <TeamMemberTasks key={employee.id} leaveDays={leaveByEmployee[employee.id] ?? []} tasks={memberTasks.map(task => ({
        ...serializeTaskRepeat(task), startDate: task.startDate?.toISOString() ?? null, dueDate: task.dueDate?.toISOString() ?? null,
        createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString(),
        comments: task.comments.map(comment => ({ ...comment, createdAt: comment.createdAt.toISOString() })),
      }))} />
    </> : undefined}
    tasks={companyTaskSnapshot(tasks)} reviews={reviews} />;
}
