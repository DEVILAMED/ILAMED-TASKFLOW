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

  const [tasks, feedback] = await Promise.all([prisma.task.findMany({
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
  }), prisma.taskReview.findMany({
    where: { submission: { task: { projectId: COMPANY_TASK_PROJECT_ID, assigneeId: user.id } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, feedback: true, rating: true, createdAt: true, reviewer: { select: { name: true, email: true } }, submission: { select: { task: { select: { id: true, title: true } } } } },
  })]);

  return (
    <WorkspaceShell
      title="My assigned tasks"
      currentWorkspace="projects"
      navItems={[
        ...(user.role === "MANAGER" ? [{ href: "/manager", label: "Team overview", icon: "dashboard" as const }] : []),
        { href: "/company-tasks", label: "My tasks", icon: "board", active: true },
        { href: "/departments", label: "My department", icon: "team" },
        ...(user.role === "MANAGER" ? [{ href: "/reviews", label: "Review queue", icon: "reports" as const }] : []),
        { href: "/reports", label: "Reports", icon: "reports" },
      ]}
      userName={user.name || user.email}
      userEmail={user.email}
      userAction={<LogoutButton />}
    >
      <div className="mx-auto w-full max-w-6xl">
        <section className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm font-medium text-[var(--accent)]">My workspace</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">Welcome back, {user.name || "there"}</h2><p className="mt-1 text-sm text-[var(--muted)]">Here’s what needs your attention today.</p></div>
          <div className="hidden sm:block"><CompanyContext /></div>
        </section>
        <CompanyTaskBoard
          isAdmin={false}
          employees={[]}
          initialFeedback={feedback.map((review) => ({ id: review.id, taskId: review.submission.task.id, feedback: review.feedback, rating: review.rating, reviewer: review.reviewer.name || review.reviewer.email }))}
          initialTasks={tasks.map((task) => ({
            ...task,
            dueDate: task.dueDate?.toISOString() ?? null,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
          }))}
        />
        <section className="panel-card mt-5 rounded-2xl p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-[var(--foreground)]">Recent manager feedback</h2><span className="text-xs text-[var(--muted)]">Latest reviews</span></div>
          {feedback.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{feedback.slice(0, 4).map((review) => <article key={review.id} className="rounded-xl border border-[var(--stroke)] bg-[var(--panel-soft)] p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-medium text-[var(--foreground)]">{review.submission.task.title}</p><span className="shrink-0 text-xs font-semibold text-[var(--accent)]">{review.rating ? `${review.rating}/5` : "Feedback"}</span></div><p className="mt-2 text-sm leading-5 text-[var(--muted)]">{review.feedback}</p><p className="mt-2 text-[11px] text-[var(--subtle)]">{review.reviewer.name || review.reviewer.email} · {review.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p></article>)}</div> : <p className="mt-3 text-sm text-[var(--muted)]">Manager feedback will appear here after a task review.</p>}
        </section>
      </div>
    </WorkspaceShell>
  );
}
