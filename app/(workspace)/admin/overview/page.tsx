import { redirect } from "next/navigation";
import OverviewDashboard from "./overview-dashboard";
import "./overview.css";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

export default async function AdminOverviewPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") redirect("/company-tasks");

  const reviewSince = new Date();
  reviewSince.setMonth(reviewSince.getMonth() - 5, 1);
  reviewSince.setHours(0, 0, 0, 0);
  const [users, tasks, departments, reviews, recentChanges] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "ADMIN" } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true, isBlocked: true, createdAt: true, lastSeenAt: true,
        employeeProfile: { select: { employeeCode: true, phone: true, designation: true, joiningDate: true, employmentStatus: true, departmentId: true, managerId: true } },
      },
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
        assignee: { select: { id: true, name: true, email: true, employeeProfile: { select: { departmentId: true } } } },
        checklistItems: {
          orderBy: { position: "asc" },
          select: { id: true, title: true, isCompleted: true, position: true },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.taskReview.findMany({
      where: { createdAt: { gte: reviewSince }, submission: { task: { projectId: COMPANY_TASK_PROJECT_ID } } },
      orderBy: { createdAt: "asc" },
      select: {
        rating: true,
        createdAt: true,
        submission: {
          select: {
            task: {
              select: {
                assigneeId: true,
                assignee: { select: { name: true, email: true } },
              },
            },
          },
        },
      },
    }),
    prisma.taskStatusHistory.findMany({ where: { task: { projectId: COMPANY_TASK_PROJECT_ID } }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, fromStatus: true, toStatus: true, createdAt: true, actor: { select: { name: true, email: true } }, task: { select: { title: true } } } }),
  ]);

  const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
  const now = new Date();
  const today = dateFormatter.format(now);
  const terminal = (status: string) => ["DONE", "APPROVED", "REJECTED", "CANCELLED"].includes(status);
  const completed = tasks.filter((task) => task.status === "DONE" || task.status === "APPROVED").length;
  const pending = tasks.filter((task) => !terminal(task.status)).length;
  const inProgress = tasks.filter((task) => task.status === "IN_PROGRESS").length;
  const overdue = tasks.filter((task) => !terminal(task.status) && task.dueDate && task.dueDate.toISOString().slice(0, 10) < today).length;
  const awaitingReview = tasks.filter((task) => task.status === "SUBMITTED_FOR_REVIEW").length;
  const activeEmployees = users.filter((employee) => !employee.isBlocked && employee.employeeProfile?.employmentStatus !== "INACTIVE").length;
  const productivity = tasks.length ? Math.round(completed / tasks.length * 100) : null;
  const departmentStats = departments.map((department) => {
    const departmentTasks = tasks.filter((task) => task.assignee?.employeeProfile?.departmentId === department.id);
    const departmentCompleted = departmentTasks.filter((task) => task.status === "APPROVED" || task.status === "DONE").length;
    return { ...department, taskCount: departmentTasks.length, completed: departmentCompleted, completion: departmentTasks.length ? Math.round(departmentCompleted / departmentTasks.length * 100) : null };
  });
  const upcomingTasks = tasks.filter((task) => !terminal(task.status) && task.dueDate && task.dueDate.toISOString().slice(0, 10) >= today)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime()).slice(0, 5);
  const trend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(reviewSince.getFullYear(), reviewSince.getMonth() + index, 1);
    const monthReviews = reviews.filter((review) => review.createdAt.getFullYear() === date.getFullYear() && review.createdAt.getMonth() === date.getMonth() && review.rating !== null);
    return { label: date.toLocaleDateString("en-US", { month: "short" }), count: monthReviews.length, average: monthReviews.length ? monthReviews.reduce((sum, review) => sum + (review.rating ?? 0), 0) / monthReviews.length : null };
  });
  const ratingPoints = trend.map((item, index) => item.average === null ? null : `${30 + index * 106},${145 - ((item.average - 1) / 4) * 120}`).filter((point): point is string => point !== null);
  const performers = new Map<string, { label: string; total: number; count: number }>();
  for (const review of reviews) {
    const id = review.submission.task.assigneeId;
    if (!id || review.rating === null) continue;
    const person = performers.get(id) ?? { label: review.submission.task.assignee?.name || review.submission.task.assignee?.email || "Employee", total: 0, count: 0 };
    person.total += review.rating; person.count += 1; performers.set(id, person);
  }
  const topPerformers = [...performers.entries()].map(([id, value]) => ({ id, ...value, average: value.total / value.count })).sort((a, b) => b.average - a.average || b.count - a.count).slice(0, 5);
  const employees = users.map((person) => {
    const assigned = tasks.filter((task) => task.assignee?.id === person.id);
    return {
      id: person.id, name: person.name || person.email, email: person.email,
      designation: person.employeeProfile?.designation || (person.role === "MANAGER" ? "Team manager" : "Team member"),
      departmentId: person.employeeProfile?.departmentId ?? null,
      departmentName: departments.find((department) => department.id === person.employeeProfile?.departmentId)?.name || "Unassigned",
      assigned: assigned.length,
      reviewScore: performers.has(person.id) ? performers.get(person.id)!.total / performers.get(person.id)!.count : null,
      active: assigned.filter((task) => !terminal(task.status)).length,
      inProgress: assigned.filter((task) => task.status === "IN_PROGRESS").length,
      awaiting: assigned.filter((task) => task.status === "SUBMITTED_FOR_REVIEW").length,
      completed: assigned.filter((task) => task.status === "DONE" || task.status === "APPROVED").length,
      overdue: assigned.filter((task) => !terminal(task.status) && task.dueDate && task.dueDate.toISOString().slice(0, 10) < today).length,
    };
  });
  const distribution = [
    { label: "Not started", count: tasks.filter((task) => task.status === "TODO" || task.status === "ACCEPTED").length, color: "#2542b3", href: "/admin?focus=NOT_STARTED" },
    { label: "In progress", count: tasks.filter((task) => ["IN_PROGRESS", "ON_HOLD", "REVISION_REQUESTED"].includes(task.status)).length, color: "#2860ee", href: "/admin?focus=IN_FLIGHT" },
    { label: "Awaiting review", count: awaitingReview, color: "#9b86cf", href: "/admin?status=SUBMITTED_FOR_REVIEW" },
    { label: "Completed", count: completed, color: "#11958d", href: "/admin?focus=COMPLETED" },
    { label: "Other closed", count: tasks.filter((task) => ["CANCELLED", "REJECTED"].includes(task.status)).length, color: "#c3cbd5", href: "/admin?focus=OTHER_CLOSED" },
  ];

  return <>
    <OverviewDashboard
      dateLabel={now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Kolkata" })}
      employees={employees} departments={departments}
      counts={{ employees: activeEmployees, createdToday: tasks.filter((task) => dateFormatter.format(task.createdAt) === today).length, inProgress, awaiting: awaitingReview, overdue, completed, total: tasks.length }}
      distribution={distribution}
    />
    <details className="overview-extra"><summary>Additional insights</summary><div className="overview-details mt-5 grid gap-5">
      <section className="grid gap-5 lg:grid-cols-2">
          <div className="panel-card rounded-3xl p-5 sm:p-6"><p className="section-kicker">By department</p><h2 className="mt-2 text-lg font-semibold text-white/90">Task completion</h2>
            {departmentStats.length ? <div className="mt-4 grid gap-4">{departmentStats.map((department) => <div key={department.id}><div className="flex justify-between gap-3 text-xs"><span className="text-white/70">{department.name}</span><span className="text-white/40">{department.completed}/{department.taskCount} approved</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${department.completion ?? 0}%` }} /></div></div>)}</div> : <p className="mt-3 text-sm text-white/40">Create departments and assign employee profiles to compare teams.</p>}
          </div>
          <div className="panel-card rounded-3xl p-5 sm:p-6"><p className="section-kicker">Deadlines</p><h2 className="mt-2 text-lg font-semibold text-white/90">Upcoming work</h2>
            {upcomingTasks.length ? <div className="mt-3 divide-y divide-white/[0.07]">{upcomingTasks.map((task) => <div key={task.id} className="flex justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm text-white/75">{task.title}</p><p className="mt-1 text-xs text-white/40">{task.assignee?.name || task.assignee?.email || "Unassigned"}</p></div><time className="shrink-0 text-xs text-white/45">{task.dueDate?.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</time></div>)}</div> : <p className="mt-3 text-sm text-white/40">No upcoming deadlines.</p>}
          </div>
        </section>
      <section className="grid gap-5 lg:grid-cols-2">
<div className="panel-card rounded-2xl p-5"><div className="flex items-start justify-between"><div><p className="section-kicker">Performance overview</p><h2 className="mt-1 text-base font-semibold text-[var(--foreground)]">Reviewed work quality</h2></div><span className="rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700">Out of 5</span></div>
            {ratingPoints.length ? <div className="mt-4"><svg viewBox="0 0 600 180" role="img" aria-label="Average task review ratings over the last six months" className="h-44 w-full overflow-visible"><line x1="28" y1="25" x2="590" y2="25" stroke="var(--stroke)"/><line x1="28" y1="85" x2="590" y2="85" stroke="var(--stroke)"/><line x1="28" y1="145" x2="590" y2="145" stroke="var(--stroke)"/><text x="0" y="29" fill="var(--muted)" fontSize="10">5</text><text x="0" y="89" fill="var(--muted)" fontSize="10">3</text><text x="0" y="149" fill="var(--muted)" fontSize="10">1</text>{ratingPoints.length > 1 ? <polyline points={ratingPoints.join(" ")} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}{trend.map((item, index) => item.average === null ? null : <g key={item.label}><circle cx={30 + index * 106} cy={145 - ((item.average - 1) / 4) * 120} r="4.5" fill="var(--accent)" stroke="var(--panel)" strokeWidth="2"/><text x={30 + index * 106} y="171" textAnchor="middle" fill="var(--muted)" fontSize="10">{item.label}</text></g>)}</svg><p className="mt-1 text-[11px] text-[var(--muted)]">Monthly average from actual manager ratings. Empty months have no score.</p></div> : <p className="mt-6 rounded-xl bg-[var(--panel-soft)] p-5 text-sm text-[var(--muted)]">Review ratings will create a quality trend here. No reviewed submissions are available yet.</p>}
          </div>
<div className="panel-card rounded-2xl p-5"><p className="section-kicker">Top performers</p><h2 className="mt-1 text-base font-semibold text-[var(--foreground)]">Highest reviewed quality</h2>{topPerformers.length ? <div className="mt-3 divide-y divide-[var(--stroke)]">{topPerformers.map((person, index) => <div key={person.id} className="flex items-center gap-3 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-xs font-semibold text-indigo-700">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[var(--foreground)]">{person.label}</span><span className="text-[11px] text-[var(--muted)]">{person.count} reviewed {person.count === 1 ? "task" : "tasks"}</span></span><span className="font-semibold text-[var(--accent)]">{person.average.toFixed(1)} / 5</span></div>)}</div> : <p className="mt-4 text-sm text-[var(--muted)]">Ratings will appear after managers review submitted work.</p>}</div>
      </section>
<div className="panel-card rounded-2xl p-5"><p className="section-kicker">Activity</p><h2 className="mt-1 text-base font-semibold text-[var(--foreground)]">Recent task changes</h2>{recentChanges.length ? <div className="mt-3 grid gap-3">{recentChanges.map((change) => <div key={change.id} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500"/><p className="text-xs leading-5 text-[var(--muted)]"><span className="font-medium text-[var(--foreground)]">{change.actor.name || change.actor.email}</span> changed <span className="font-medium text-[var(--foreground)]">{change.task.title}</span> to {change.toStatus.replaceAll("_", " ").toLowerCase()} <span className="block text-[10px] text-[var(--subtle)]">{change.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></p></div>)}</div> : <p className="mt-4 text-sm text-[var(--muted)]">Task status history will appear here as work moves forward.</p>}</div>
    </div></details>
  </>;
}
