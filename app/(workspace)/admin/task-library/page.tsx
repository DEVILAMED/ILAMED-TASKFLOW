import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import WorkspacePageHeading from "@/app/workspace-page-heading";
import TaskLifecycleButton from "@/app/task-lifecycle-button";

export default async function TaskLibraryPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/company-tasks");
  const params = await searchParams;
  const trash = params.view === "trash";
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const tasks = await prisma.task.findMany({
    where: { projectId: COMPANY_TASK_PROJECT_ID, ...(trash ? { deletedAt: { not: null } } : { deletedAt: null, archivedAt: { not: null } }) },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 51,
    select: { id: true, title: true, status: true, archivedAt: true, deletedAt: true, assignee: { select: { name: true, email: true } } },
  });
  const href = (next: number) => `/admin/task-library?view=${trash ? "trash" : "archived"}&page=${next}`;
  return <div className="workspace-view"><WorkspacePageHeading kicker="TASK HISTORY" title={trash ? "Recycle bin" : "Archived tasks"} description="Task instructions, submissions, reviews, and uploaded files are retained. Restoring a task preserves its previous status." action={<Link href="/admin" className="secondary-button px-3 py-2">Back to tasks</Link>} />
    <nav className="flex gap-4 text-sm" aria-label="Task collections"><Link href="/admin/task-library" aria-current={!trash ? "page" : undefined}>Archived tasks</Link><Link href="/admin/task-library?view=trash" aria-current={trash ? "page" : undefined}>Recycle bin</Link></nav>
    <section className="workspace-surface"><p className="mb-4 text-sm text-[var(--muted)]">{trash ? "Deleted tasks remain here until an administrator restores them. Uploaded evidence is retained." : "Archived tasks are hidden from active work lists and remain available in reports. Unarchive a task before editing it."} Daily schedules continue independently; stop daily repeat to prevent future tasks.</p>
      {tasks.slice(0, 50).map(task => <article key={task.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--stroke)] py-4"><div><h2 className="text-sm font-semibold">{trash ? task.title : <Link href={`/company-tasks/${encodeURIComponent(task.id)}?returnTo=${encodeURIComponent("/admin/task-library")}`} className="text-[var(--accent)]">{task.title}</Link>}</h2><p className="mt-1 text-xs text-[var(--muted)]">{task.assignee?.name || task.assignee?.email || "Unassigned"} · {task.status.replaceAll("_", " ").toLowerCase()} · {(trash ? task.deletedAt : task.archivedAt)?.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p></div><TaskLifecycleButton taskId={task.id} action={trash ? "RESTORE" : "UNARCHIVE"} /></article>)}
      {!tasks.length ? <p className="py-5 text-sm text-[var(--muted)]">No tasks in this collection.</p> : null}
      <div className="mt-4 flex justify-between text-sm">{page > 1 ? <Link href={href(page - 1)}>Previous</Link> : <span />}{tasks.length > 50 ? <Link href={href(page + 1)}>Next</Link> : null}</div>
    </section></div>;
}
