import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import LogoutButton from "@/app/dashboard/logout-button";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

const STATUS_ROWS = [
  { key: "TODO", label: "Not started", color: "bg-slate-400" },
  { key: "ACCEPTED", label: "Accepted", color: "bg-indigo-400" },
  { key: "IN_PROGRESS", label: "In progress", color: "bg-sky-400" },
  { key: "ON_HOLD", label: "On hold", color: "bg-amber-400" },
  { key: "SUBMITTED_FOR_REVIEW", label: "Awaiting review", color: "bg-violet-400" },
  { key: "REVISION_REQUESTED", label: "Revision requested", color: "bg-orange-400" },
  { key: "APPROVED", label: "Approved", color: "bg-emerald-400" },
  { key: "REJECTED", label: "Rejected", color: "bg-rose-400" },
  { key: "CANCELLED", label: "Cancelled", color: "bg-slate-500" },
  { key: "DONE", label: "Legacy completed", color: "bg-teal-400" },
] as const;

const completedStatus = (status: string) => status === "APPROVED" || status === "DONE";
const terminalStatus = (status: string) => completedStatus(status) || status === "CANCELLED" || status === "REJECTED";

const PRIORITY_ROWS = [
  { key: "HIGH", label: "High", color: "bg-rose-400" },
  { key: "MEDIUM", label: "Normal", color: "bg-amber-400" },
  { key: "LOW", label: "Low", color: "bg-emerald-400" },
] as const;

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dueDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDueDate(value: Date) {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function employeeName(assignee: { name: string | null; email: string } | null) {
  return assignee ? assignee.name || assignee.email : "Unassigned";
}

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const managerMemberships = user.role === "MANAGER"
    ? await prisma.teamMembership.findMany({ where: { userId: user.id, role: "MANAGER" }, select: { teamId: true } })
    : [];
  const managerMembers = managerMemberships.length
    ? await prisma.teamMembership.findMany({ where: { teamId: { in: managerMemberships.map((membership) => membership.teamId) } }, select: { userId: true } })
    : [];
  const reportAssigneeIds = [...new Set([user.id, ...managerMembers.map((membership) => membership.userId)])];
  const tasks = await prisma.task.findMany({
    where: {
      projectId: COMPANY_TASK_PROJECT_ID,
      ...(user.role === "ADMIN" ? {} : { assigneeId: { in: user.role === "MANAGER" ? reportAssigneeIds : [user.id] } }),
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  const today = dayKey(new Date());
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const nextWeek = new Date(todayDate);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const nextWeekKey = nextWeek.toISOString().slice(0, 10);
  const completed = tasks.filter((task) => completedStatus(task.status)).length;
  const overdue = tasks.filter(
    (task) => !terminalStatus(task.status) && task.dueDate && dueDayKey(task.dueDate) < today,
  ).length;
  const dueSoon = tasks.filter((task) => {
    if (terminalStatus(task.status) || !task.dueDate) return false;
    const dueDay = dueDayKey(task.dueDate);
    return dueDay >= today && dueDay <= nextWeekKey;
  }).length;
  const completionRate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const statusCounts = STATUS_ROWS.map((row) => ({
    ...row,
    count: tasks.filter((task) => task.status === row.key).length,
  }));
  const priorityCounts = PRIORITY_ROWS.map((row) => ({
    ...row,
    count: tasks.filter((task) => task.priority === row.key).length,
  }));

  const assigneeMap = new Map<string, {
    id: string;
    name: string;
    total: number;
    completed: number;
  }>();
  for (const task of tasks) {
    const id = task.assignee?.id ?? "unassigned";
    const current = assigneeMap.get(id) ?? {
      id,
      name: employeeName(task.assignee),
      total: 0,
      completed: 0,
    };
    current.total += 1;
    if (completedStatus(task.status)) current.completed += 1;
    assigneeMap.set(id, current);
  }
  const assignees = [...assigneeMap.values()].sort(
    (left, right) => right.total - left.total || left.name.localeCompare(right.name),
  );
  const tasksToWatch = tasks
    .filter((task) => !terminalStatus(task.status) && task.dueDate && dueDayKey(task.dueDate) <= nextWeekKey)
    .sort((left, right) => left.dueDate!.getTime() - right.dueDate!.getTime())
    .slice(0, 6);

  return (
    <WorkspaceShell
      title="Task reports"
      currentWorkspace="projects"
      navItems={[
        {
          href: user.role === "ADMIN" ? "/admin" : "/company-tasks",
          label: user.role === "ADMIN" ? "Tasks" : "My tasks",
          icon: "board",
        },
        { href: "/reports", label: "Reports", icon: "reports", active: true },
        ...(user.role === "ADMIN"
          ? [{ href: "/admin#employees", label: "Employees", icon: "team" as const }]
          : []),
      ]}
      userName={user.name || user.email}
      userEmail={user.email}
      userAction={<LogoutButton />}
      topbarRight={user.role === "ADMIN" ? <span className="badge-pill text-xs text-[var(--accent)]">Administrator</span> : undefined}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <section className="panel-card rounded-3xl p-5 sm:p-7">
          <p className="section-kicker">Company tasks</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="display-font text-3xl text-white/95 sm:text-4xl">Workload at a glance</h2>
              <p className="mt-2 text-sm text-white/50">
                {user.role === "ADMIN" ? "Progress and deadlines across all assigned work." : "Progress and deadlines for your assigned work."}
              </p>
            </div>
            <p className="text-xs text-white/40">Current task snapshot</p>
          </div>
        </section>

        <section aria-label="Task summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total tasks", value: tasks.length, detail: "In this report" },
            { label: "Completed", value: completed, detail: `${completionRate}% completion rate` },
            { label: "Overdue", value: overdue, detail: "Open tasks past due" },
            { label: "Due this week", value: dueSoon, detail: "Open tasks due in 7 days" },
          ].map((metric) => (
            <article key={metric.label} className="panel-card rounded-2xl p-5">
              <p className="text-sm text-white/55">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-white/95">{metric.value}</p>
              <p className="mt-1 text-xs text-white/38">{metric.detail}</p>
            </article>
          ))}
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section aria-labelledby="status-heading" className="panel-card rounded-3xl p-5 sm:p-6">
            <div className="mb-5">
              <p className="section-kicker">Progress</p>
              <h3 id="status-heading" className="mt-2 text-lg font-semibold text-white/90">Tasks by status</h3>
            </div>
            <div className="space-y-5">
              {statusCounts.map((row) => {
                const percentage = tasks.length ? (row.count / tasks.length) * 100 : 0;
                return (
                  <div key={row.key}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-white/75">
                        <span className={`h-2.5 w-2.5 rounded-full ${row.color}`} />
                        {row.label}
                      </span>
                      <span className="tabular-nums text-white/55">{row.count} <span className="text-white/35">· {Math.round(percentage)}%</span></span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${row.label}: ${row.count} tasks`}
                      aria-valuemin={0}
                      aria-valuemax={tasks.length}
                      aria-valuenow={row.count}
                      className="h-2 overflow-hidden rounded-full bg-white/10"
                    >
                      <div className={`h-full rounded-full ${row.color}`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {!tasks.length ? <p className="mt-5 text-sm text-white/40">There are no tasks to analyze yet.</p> : null}
          </section>

          <section aria-labelledby="priority-heading" className="panel-card rounded-3xl p-5 sm:p-6">
            <div className="mb-5">
              <p className="section-kicker">Planning</p>
              <h3 id="priority-heading" className="mt-2 text-lg font-semibold text-white/90">Tasks by priority</h3>
            </div>
            <div className="space-y-5">
              {priorityCounts.map((row) => {
                const percentage = tasks.length ? (row.count / tasks.length) * 100 : 0;
                return (
                  <div key={row.key}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-white/75">
                        <span className={`h-2.5 w-2.5 rounded-full ${row.color}`} />
                        {row.label}
                      </span>
                      <span className="tabular-nums text-white/55">{row.count} <span className="text-white/35">· {Math.round(percentage)}%</span></span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${row.label} priority: ${row.count} tasks`}
                      aria-valuemin={0}
                      aria-valuemax={tasks.length}
                      aria-valuenow={row.count}
                      className="h-2 overflow-hidden rounded-full bg-white/10"
                    >
                      <div className={`h-full rounded-full ${row.color}`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className={`grid gap-5 ${user.role === "ADMIN" ? "lg:grid-cols-2" : ""}`}>
          {user.role === "ADMIN" ? (
            <section aria-labelledby="assignee-heading" className="panel-card rounded-3xl p-5 sm:p-6">
              <div className="mb-5">
                <p className="section-kicker">Team</p>
                <h3 id="assignee-heading" className="mt-2 text-lg font-semibold text-white/90">Workload by assignee</h3>
              </div>
              {assignees.length ? (
                <div className="space-y-4">
                  {assignees.map((assignee) => (
                    <div key={assignee.id}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-white/75">{assignee.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-white/45">
                          {assignee.completed}/{assignee.total} complete
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`${assignee.name}: ${assignee.completed} of ${assignee.total} tasks complete`}
                        aria-valuemin={0}
                        aria-valuemax={assignee.total}
                        aria-valuenow={assignee.completed}
                        className="h-2 overflow-hidden rounded-full bg-white/10"
                      >
                        <div
                          className="h-full rounded-full bg-emerald-400"
                          style={{ width: `${(assignee.completed / assignee.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/40">No assigned tasks to report.</p>
              )}
            </section>
          ) : null}

          <section aria-labelledby="due-heading" className="panel-card rounded-3xl p-5 sm:p-6">
            <div className="mb-5">
              <p className="section-kicker">Deadlines</p>
              <h3 id="due-heading" className="mt-2 text-lg font-semibold text-white/90">Tasks to watch</h3>
              <p className="mt-1 text-xs text-white/40">Overdue and upcoming open tasks</p>
            </div>
            {tasksToWatch.length ? (
              <ul className="divide-y divide-white/[0.08]">
                {tasksToWatch.map((task) => {
                  const isOverdue = dueDayKey(task.dueDate!) < today;
                  return (
                    <li key={task.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white/80">{task.title}</p>
                        {user.role === "ADMIN" ? <p className="mt-1 truncate text-xs text-white/40">{employeeName(task.assignee)}</p> : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-xs font-medium ${isOverdue ? "text-rose-300" : "text-white/60"}`}>
                          {isOverdue ? "Overdue" : formatDueDate(task.dueDate!)}
                        </p>
                        {isOverdue ? <p className="mt-1 text-[11px] text-white/35">{formatDueDate(task.dueDate!)}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-white/45">No overdue or upcoming deadlines. You’re all caught up.</p>
            )}
          </section>
        </div>
      </div>
    </WorkspaceShell>
  );
}
