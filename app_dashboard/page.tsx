import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessibleProjectWhere } from "@/project-access";
import DeleteProjectButton from "./delete-project-button";
import LogoutButton from "./logout-button";
import NewProjectForm from "./new-project-form";

type DashboardTask = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: Date | null;
  updatedAt: Date;
  projectId: string;
  assignee: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  project: {
    title: string;
  };
};

const PRIORITY_WEIGHT: Record<DashboardTask["priority"], number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

function formatProjectDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatActivityDate(date: Date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDueDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isWithinNextDays(date: Date, days: number) {
  const today = startOfToday();
  const end = new Date(today);
  end.setDate(today.getDate() + days);
  const normalized = startOfDate(date);
  return normalized >= today && normalized <= end;
}

function formatRelativeDueDate(date: Date) {
  const today = startOfToday();
  const due = startOfDate(date);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (diff < 0) {
    return `${Math.abs(diff)}d overdue`;
  }

  if (diff === 0) {
    return "Due today";
  }

  if (diff === 1) {
    return "Due tomorrow";
  }

  return `Due in ${diff}d`;
}

function getCompletion(total: number, done: number) {
  if (!total) {
    return 0;
  }

  return Math.round((done / total) * 100);
}

function getPersonLabel(person: { name: string | null; email: string }) {
  return person.name || person.email;
}

function getProjectMood(overdue: number, dueSoon: number, active: number) {
  if (overdue > 0) {
    return {
      label: `${overdue} overdue`,
      className: "border-red-500/20 bg-red-500/10 text-red-300",
    };
  }

  if (dueSoon > 0) {
    return {
      label: `${dueSoon} due soon`,
      className: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    };
  }

  if (active === 0) {
    return {
      label: "Calm lane",
      className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    };
  }

  return {
    label: "Healthy pace",
    className: "border-[var(--accent)]/20 bg-[rgba(62,214,177,0.12)] text-[var(--accent)]",
  };
}

function getPriorityTone(priority: DashboardTask["priority"]) {
  switch (priority) {
    case "HIGH":
      return "text-red-300";
    case "MEDIUM":
      return "text-amber-300";
    case "LOW":
    default:
      return "text-sky-300";
  }
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [projects, activities, tasks] = await Promise.all([
    prisma.project.findMany({
      where: accessibleProjectWhere(user.id),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        ownerId: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          select: {
            userId: true,
          },
        },
      },
    }),
    prisma.activity.findMany({
      where: { project: accessibleProjectWhere(user.id) },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        project: accessibleProjectWhere(user.id),
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        updatedAt: true,
        projectId: true,
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            title: true,
          },
        },
      },
    }),
  ]);

  const allTasks = tasks as DashboardTask[];
  const today = startOfToday();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const openTasks = allTasks.filter((task) => task.status !== "DONE").length;
  const dueSoonTasks = allTasks.filter((task) => {
    if (!task.dueDate || task.status === "DONE") {
      return false;
    }

    return isWithinNextDays(task.dueDate, 7);
  }).length;
  const overdueTasks = allTasks.filter((task) => {
    if (!task.dueDate || task.status === "DONE") {
      return false;
    }

    return startOfDate(task.dueDate) < today;
  }).length;
  const sharedProjects = projects.filter((project) => project.ownerId !== user.id).length;
  const highPriorityOpen = allTasks.filter((task) => task.status !== "DONE" && task.priority === "HIGH").length;
  const doneThisWeek = allTasks.filter((task) => task.status === "DONE" && task.updatedAt >= weekAgo).length;
  const assignedToMeOpen = allTasks.filter((task) => task.assignee?.id === user.id && task.status !== "DONE");
  const unassignedOpen = allTasks.filter((task) => task.status !== "DONE" && !task.assignee).length;
  const currentDateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const tasksByProject = new Map<string, DashboardTask[]>();
  for (const task of allTasks) {
    const projectTasks = tasksByProject.get(task.projectId) ?? [];
    projectTasks.push(task);
    tasksByProject.set(task.projectId, projectTasks);
  }

  const upcomingTasks = allTasks
    .filter((task) => {
      if (!task.dueDate || task.status === "DONE") {
        return false;
      }

      return startOfDate(task.dueDate) < today || isWithinNextDays(task.dueDate, 7);
    })
    .sort((left, right) => {
      if (!left.dueDate || !right.dueDate) {
        return 0;
      }

      return left.dueDate.getTime() - right.dueDate.getTime();
    })
    .slice(0, 6);

  const myQueue = assignedToMeOpen
    .slice()
    .sort((left, right) => {
      if (left.dueDate && right.dueDate) {
        const dueDifference = left.dueDate.getTime() - right.dueDate.getTime();
        if (dueDifference !== 0) {
          return dueDifference;
        }
      }

      if (left.dueDate) {
        return -1;
      }

      if (right.dueDate) {
        return 1;
      }

      const priorityDifference = PRIORITY_WEIGHT[left.priority] - PRIORITY_WEIGHT[right.priority];
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return right.updatedAt.getTime() - left.updatedAt.getTime();
    })
    .slice(0, 5);

  const projectSnapshots = projects
    .map((project) => {
      const projectTasks = tasksByProject.get(project.id) ?? [];
      const totalProjectTasks = projectTasks.length;
      const doneProjectTasks = projectTasks.filter((task) => task.status === "DONE").length;
      const activeProjectTasks = projectTasks.filter((task) => task.status !== "DONE").length;
      const dueSoonProjectTasks = projectTasks.filter((task) => {
        if (!task.dueDate || task.status === "DONE") {
          return false;
        }

        return isWithinNextDays(task.dueDate, 7);
      }).length;
      const overdueProjectTasks = projectTasks.filter((task) => {
        if (!task.dueDate || task.status === "DONE") {
          return false;
        }

        return startOfDate(task.dueDate) < today;
      }).length;
      const progress = getCompletion(totalProjectTasks, doneProjectTasks);
      const memberCount = new Set([project.ownerId, ...project.members.map((member) => member.userId)]).size;
      const isOwner = project.ownerId === user.id;

      return {
        ...project,
        totalProjectTasks,
        doneProjectTasks,
        activeProjectTasks,
        dueSoonProjectTasks,
        overdueProjectTasks,
        progress,
        memberCount,
        isOwner,
        mood: getProjectMood(overdueProjectTasks, dueSoonProjectTasks, activeProjectTasks),
      };
    })
    .sort((left, right) => {
      if (right.overdueProjectTasks !== left.overdueProjectTasks) {
        return right.overdueProjectTasks - left.overdueProjectTasks;
      }

      if (right.dueSoonProjectTasks !== left.dueSoonProjectTasks) {
        return right.dueSoonProjectTasks - left.dueSoonProjectTasks;
      }

      return right.activeProjectTasks - left.activeProjectTasks;
    });

  return (
    <WorkspaceShell
      title="Dashboard"
      currentWorkspace="projects"
      userRole={user.role}
      userName={user.name || user.email}
      userEmail={user.email}
      userAction={<LogoutButton />}
      topbarRight={
        <>
          <span className="badge-pill hidden text-xs text-white/58 md:inline-flex">{currentDateLabel}</span>
          <span className="badge-pill hidden text-xs text-white/58 xl:inline-flex">{dueSoonTasks} due soon</span>
          <NewProjectForm />
        </>
      }
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="panel-card rounded-[34px] p-6 sm:p-8">
          <div className="surface-grid absolute inset-y-0 right-0 w-1/2 opacity-[0.08]" />
          <div className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr] xl:items-center">
            <div>
              <p className="section-kicker">Mission control</p>
              <h2 className="display-font mt-4 text-5xl leading-[1.02] text-white/94 sm:text-6xl">
                A calmer way to see what needs love today.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/48">
                Your dashboard now pulls together project health, personal workload, and deadline risk so the next move is easier to spot at a glance.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-white/60">
                <span className="badge-pill">{projects.length} workspaces</span>
                <span className="badge-pill">{assignedToMeOpen.length} in your queue</span>
                <span className="badge-pill">{highPriorityOpen} high priority open</span>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="#projects" className="accent-button flex h-11 items-center justify-center px-5 text-xs font-semibold uppercase tracking-[0.18em]">
                  Review projects
                </Link>
                <Link href="#activity" className="secondary-button flex h-11 items-center justify-center px-5 text-xs font-semibold uppercase tracking-[0.18em]">
                  Check activity
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="panel-card-soft rounded-[28px] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/28">Open tasks</p>
                <p className="mt-3 text-4xl font-semibold text-white/92">{openTasks}</p>
                <p className="mt-2 text-sm text-white/38">Across every workspace you can access</p>
              </div>
              <div className="panel-card-soft rounded-[28px] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/28">Due this week</p>
                <p className="mt-3 text-4xl font-semibold text-white/92">{dueSoonTasks}</p>
                <p className="mt-2 text-sm text-white/38">Tasks landing in the next 7 days</p>
              </div>
              <div className="panel-card-soft rounded-[28px] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/28">Needs attention</p>
                <p className="mt-3 text-4xl font-semibold text-white/92">{overdueTasks}</p>
                <p className="mt-2 text-sm text-white/38">Overdue tasks still in motion</p>
              </div>
              <div className="panel-card-soft rounded-[28px] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/28">Shared workspaces</p>
                <p className="mt-3 text-4xl font-semibold text-white/92">{sharedProjects}</p>
                <p className="mt-2 text-sm text-white/38">Projects where you collaborate as a member</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="panel-card-soft rounded-[28px] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/28">Assigned to you</p>
            <p className="mt-3 text-3xl font-semibold text-white/92">{assignedToMeOpen.length}</p>
            <p className="mt-2 text-sm text-white/38">Open tasks with your name on them</p>
          </div>
          <div className="panel-card-soft rounded-[28px] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/28">High priority</p>
            <p className="mt-3 text-3xl font-semibold text-white/92">{highPriorityOpen}</p>
            <p className="mt-2 text-sm text-white/38">High-impact work still active</p>
          </div>
          <div className="panel-card-soft rounded-[28px] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/28">Unassigned work</p>
            <p className="mt-3 text-3xl font-semibold text-white/92">{unassignedOpen}</p>
            <p className="mt-2 text-sm text-white/38">Open items waiting for an owner</p>
          </div>
          <div className="panel-card-soft rounded-[28px] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/28">Completed this week</p>
            <p className="mt-3 text-3xl font-semibold text-white/92">{doneThisWeek}</p>
            <p className="mt-2 text-sm text-white/38">Work closed in the last 7 days</p>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
          <section id="projects" className="panel-card rounded-[34px] p-6">
            <div className="flex flex-col gap-2 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/30">Projects</p>
                <p className="mt-2 text-sm text-white/42">Every workspace with progress, pressure, and team context.</p>
              </div>
              <span className="text-xs text-white/30">{projectSnapshots.length} total</span>
            </div>

            {projectSnapshots.length ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {projectSnapshots.map((project) => (
                  <div key={project.id} className="panel-card-soft panel-hover rounded-[30px] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(62,214,177,0.16),rgba(127,211,247,0.18))] text-[var(--accent)]">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M2 5C2 4.17 2.67 3.5 3.5 3.5H6L7.5 5H12.5C13.33 5 14 5.67 14 6.5V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V5Z" stroke="currentColor" strokeWidth="1.2" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-semibold text-white/88">{project.title}</h3>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${project.mood.className}`}>
                              {project.mood.label}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-7 text-white/42">
                            {project.description || "Keep tasks, owners, and updates aligned from one workspace."}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-white/30">{formatProjectDate(project.createdAt)}</span>
                    </div>

                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-[linear-gradient(135deg,rgba(62,214,177,1),rgba(127,211,247,0.82))]" style={{ width: `${project.progress}%` }} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/48">
                      <span className="badge-pill">{project.doneProjectTasks}/{project.totalProjectTasks} done</span>
                      <span className="badge-pill">{project.activeProjectTasks} active</span>
                      <span className="badge-pill">{project.memberCount} teammates</span>
                      <span className="badge-pill">{project.isOwner ? "Owner" : `Shared by ${getPersonLabel(project.owner)}`}</span>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <div className="text-sm text-white/40">
                        <p>{project.progress}% complete</p>
                        <p className="mt-1">{project.dueSoonProjectTasks} due soon / {project.overdueProjectTasks} overdue</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/projects/${project.id}`} className="accent-button flex h-10 items-center px-4 text-xs font-semibold uppercase tracking-[0.16em]">
                          Open
                        </Link>
                        {project.isOwner ? (
                          <DeleteProjectButton projectId={project.id} projectTitle={project.title} />
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-[28px] border border-dashed border-white/[0.1] bg-white/[0.03] px-5 py-12 text-center text-sm text-white/30">
                No projects yet. Create one or join a shared workspace to get started.
              </div>
            )}
          </section>

          <div className="flex flex-col gap-6">
            <section id="deadlines" className="panel-card rounded-[34px] p-6">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/30">Upcoming deadlines</p>
                  <p className="mt-2 text-sm text-white/42">Next 7 days plus anything already overdue.</p>
                </div>
                <span className="text-xs text-white/30">{upcomingTasks.length} issues</span>
              </div>

              {upcomingTasks.length ? (
                <div className="mt-4 grid gap-3">
                  {upcomingTasks.map((task) => (
                    <div key={task.id} className="rounded-[24px] border border-white/[0.08] bg-white/[0.04] px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white/86">{task.title}</p>
                          <p className="mt-1 text-xs text-white/36">
                            {task.project.title} / {task.assignee ? getPersonLabel(task.assignee) : "Unassigned"}
                          </p>
                        </div>
                        {task.dueDate ? (
                          <div className="text-right">
                            <p className="text-sm text-white/78">{formatDueDate(task.dueDate)}</p>
                            <p className={`text-xs ${startOfDate(task.dueDate) < today ? "text-red-300" : "text-amber-300"}`}>
                              {formatRelativeDueDate(task.dueDate)}
                            </p>
                          </div>
                        ) : null}
                      </div>
                      <p className={`mt-3 text-xs font-semibold uppercase tracking-[0.18em] ${getPriorityTone(task.priority)}`}>
                        {task.priority.toLowerCase()} priority
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[28px] border border-dashed border-white/[0.1] bg-white/[0.03] px-5 py-12 text-center text-sm text-white/30">
                  Nothing urgent right now. Due dates for the next week will show up here.
                </div>
              )}
            </section>

            <section className="panel-card rounded-[34px] p-6">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/30">My queue</p>
                  <p className="mt-2 text-sm text-white/42">The work currently resting on you.</p>
                </div>
                <span className="text-xs text-white/30">{assignedToMeOpen.length} open</span>
              </div>

              {myQueue.length ? (
                <div className="mt-4 grid gap-3">
                  {myQueue.map((task) => (
                    <div key={task.id} className="rounded-[24px] border border-white/[0.08] bg-white/[0.04] px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white/86">{task.title}</p>
                          <p className="mt-1 text-xs text-white/36">{task.project.title}</p>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${task.priority === "HIGH" ? "border-red-500/20 bg-red-500/10 text-red-300" : task.priority === "MEDIUM" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-sky-500/20 bg-sky-500/10 text-sky-300"}`}>
                          {task.priority.toLowerCase()}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-white/36">
                        <span>{task.status === "IN_PROGRESS" ? "In progress" : "Queued up"}</span>
                        <span>{task.dueDate ? formatRelativeDueDate(task.dueDate) : "No due date"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[28px] border border-dashed border-white/[0.1] bg-white/[0.03] px-5 py-12 text-center text-sm text-white/30">
                  Nothing assigned to you right now. Fresh work will land here automatically.
                </div>
              )}
            </section>
          </div>
        </div>

        <section id="activity" className="panel-card rounded-[34px] p-6">
          <div className="flex flex-col gap-2 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/30">Activity</p>
              <p className="mt-2 text-sm text-white/42">Latest updates from across your workspaces.</p>
            </div>
            <span className="text-xs text-white/30">Latest {activities.length} events</span>
          </div>

          {activities.length ? (
            <div className="mt-5 grid gap-3">
              {activities.map((activity) => (
                <div key={activity.id} className="rounded-[26px] border border-white/[0.08] bg-white/[0.04] px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--accent)] pulse-soft" />
                      <p className="text-sm leading-7 text-white/54">
                        <span className="font-semibold text-white/82">{activity.user.name || activity.user.email}</span>{" "}
                        {activity.message}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-white/28">{formatActivityDate(activity.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[28px] border border-dashed border-white/[0.1] bg-white/[0.03] px-5 py-12 text-center text-sm text-white/30">
              No activity yet. Create or update a task to see updates here.
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
