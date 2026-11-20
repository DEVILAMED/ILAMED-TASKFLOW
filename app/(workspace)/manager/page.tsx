import { companyTaskSnapshot, groupCompanyTaskSeries } from "@/lib/company-task-series";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import TeamTaskControls from "./team-task-controls";
import QuickAssign from "./quick-assign";
import { formatTaskDateRange } from "@/lib/task-dates";
import { USER_IDENTITY_SELECT, withAvatarUrl } from "@/lib/user-avatar";
import UserAvatar from "@/app/user-avatar";
import { getEmployeeLeave } from "@/services/employee-leave";
import { companyTaskSchedule, employeeDayKey, employeeLeaveDays, isCompanyTaskOverdue } from "@/lib/company-workdays";
import { companyTaskRepeatSelect, serializeTaskRepeat } from "@/lib/company-task-repeat";
import { ensureDailyCompanyTasks } from "@/services/recurring-company-tasks";
import CompanyTaskRepeatControl from "@/app/company-task-repeat-control";

export default async function ManagerDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role !== "MANAGER") redirect("/company-tasks");
  await ensureDailyCompanyTasks();
  const memberships = await prisma.teamMembership.findMany({ where: { userId: user.id, role: "MANAGER" }, select: { teamId: true } });
  const teamIds = memberships.map((item) => item.teamId);
  const members = teamIds.length ? await prisma.teamMembership.findMany({ where: { teamId: { in: teamIds } }, select: { userId: true } }) : [];
  const memberIds = [...new Set(members.map((item) => item.userId).filter((id) => id !== user.id))];
  const employeeIds = [...new Set([...memberIds, user.id])];
  const [employeeRows, taskRows, leaveByEmployee] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: memberIds }, role: { not: "ADMIN" }, isBlocked: false }, orderBy: [{ name: "asc" }, { email: "asc" }], select: USER_IDENTITY_SELECT }),
    prisma.task.findMany({ where: { projectId: COMPANY_TASK_PROJECT_ID, deletedAt: null, archivedAt: null, assigneeId: { in: employeeIds } }, orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }], select: { ...companyTaskRepeatSelect, id: true, title: true, description: true, status: true, priority: true, startDate: true, dueDate: true, assigneeId: true, assignedBy: { select: { id: true, name: true, email: true } }, checklistItems: { select: { isCompleted: true } }, comments: { where: { content: { startsWith: "Blocker reported:" } }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, content: true } }, assignee: { select: USER_IDENTITY_SELECT } } }),
    getEmployeeLeave(employeeIds),
  ]);
  const employees = employeeRows.map(withAvatarUrl);
  const tasks = companyTaskSnapshot(taskRows).map(task => ({ ...serializeTaskRepeat(task), assignee: task.assignee ? withAvatarUrl(task.assignee) : null }));
  const dailySchedules = [...new Map(tasks.filter(task => task.recurrenceId).map(task => [task.recurrenceId, task])).values()];
  const today = employeeDayKey();
  const terminal = (status: string) => ["APPROVED", "DONE", "CANCELLED", "REJECTED"].includes(status);
  const pending = tasks.filter((task) => !terminal(task.status)).length;
  const approvals = tasks.filter((task) => task.status === "SUBMITTED_FOR_REVIEW").length;
  const overdueTasks = tasks.filter(task => isCompanyTaskOverdue(task, today, leaveByEmployee));
  const overdue = overdueTasks.length;
  const scheduledTasks = tasks.map(task => ({ ...task, ...companyTaskSchedule(task, employeeLeaveDays(leaveByEmployee, task.assigneeId)) }));
  const dueSoon = scheduledTasks.filter(task => !terminal(task.status) && task.dueDate && task.dueDate >= today)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).slice(0, 6);
  const workloads = employees.map((employee) => ({ ...employee, open: tasks.filter((task) => task.assigneeId === employee.id && !terminal(task.status)).length, late: overdueTasks.filter(task => task.assigneeId === employee.id).length })).sort((a, b) => b.open - a.open);
  return <>
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <section className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-[var(--accent)]">Your teams</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">Welcome back, {user.name || "there"}</h2><p className="mt-1 text-sm text-[var(--muted)]">Keep team work moving and review submitted deliverables.</p></div><Link href="/reviews" className="accent-button px-4 py-2.5 text-sm font-medium">Review submissions{approvals ? ` · ${approvals}` : ""}</Link></section>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[["Open tasks", pending], ["Awaiting review", approvals], ["Overdue", overdue], ["Team members", employees.length]].map(([label, count]) => <article key={String(label)} className="panel-card rounded-2xl p-4"><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{count}</p></article>)}</section>
      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="panel-card rounded-2xl p-5"><p className="section-kicker">Team workload</p><h2 className="mt-1 text-base font-semibold text-[var(--foreground)]">Open tasks by employee</h2>
          {workloads.length ? <div className="mt-4 grid gap-4">{workloads.map((employee) => { const max = Math.max(1, ...workloads.map((item) => item.open)); return <div key={employee.id}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><Link href={`/performance?employee=${encodeURIComponent(employee.id)}`} className="user-identity text-[var(--foreground)] hover:underline"><UserAvatar name={employee.name || employee.email} src={employee.avatarUrl} size={28} />{employee.name || employee.email}</Link><span className="text-[var(--muted)]">{employee.open} open{employee.late ? ` · ${employee.late} overdue` : ""}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--panel-soft)]"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(2, employee.open / max * 100)}%` }} /></div></div>; })}</div> : <p className="mt-4 text-sm text-[var(--muted)]">No active team members yet.</p>}
        </div>
        <QuickAssign employees={employees} />
      </section>
      <TeamTaskControls tasks={groupCompanyTaskSeries(taskRows, today).map(({ task }) => ({ ...task, assignee: task.assignee ? withAvatarUrl(task.assignee) : null, ...companyTaskSchedule(task, employeeLeaveDays(leaveByEmployee, task.assigneeId)) })).filter(task => task.assigneeId !== user.id)} />
      <details className="panel-card rounded-2xl p-5"><summary className="cursor-pointer text-sm font-medium">Daily task schedules</summary><div className="mt-3 grid gap-3">{dailySchedules.map(task => <div key={task.id}><h3 className="text-sm font-medium">{task.title}</h3><CompanyTaskRepeatControl task={task} /></div>)}{!dailySchedules.length ? <p className="text-sm text-[var(--muted)]">Choose Daily when assigning a task to set up daily submissions.</p> : null}</div></details>
      <section className="panel-card rounded-2xl p-5"><div className="flex items-center justify-between"><div><p className="section-kicker">Schedule</p><h2 className="mt-1 text-base font-semibold text-[var(--foreground)]">Upcoming team work</h2></div><Link href="/company-tasks" className="text-xs font-medium text-[var(--accent)]">View my tasks</Link></div>
        {dueSoon.length ? <div className="mt-3 divide-y divide-[var(--stroke)]">{dueSoon.map((task) => <div key={task.id} className="flex flex-wrap justify-between gap-3 py-3"><div><p className="text-sm font-medium text-[var(--foreground)]">{task.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{task.assignee?.name || task.assignee?.email} · {task.status.replaceAll("_", " ").toLowerCase()}</p></div><time className="text-xs text-[var(--muted)]">{formatTaskDateRange(task.startDate, task.dueDate)}</time></div>)}</div> : <p className="mt-4 text-sm text-[var(--muted)]">No upcoming scheduled work in your teams.</p>}
      </section>
    </div>
  </>;
}
