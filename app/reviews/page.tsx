import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import LogoutButton from "@/app/dashboard/logout-button";
import { getCurrentUser } from "@/lib/auth";
import ReviewQueue from "./review-queue";

export default async function ReviewsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "MANAGER") redirect("/company-tasks");
  return <WorkspaceShell
    title="Task reviews"
    currentWorkspace="projects"
    navItems={[
      { href: user.role === "ADMIN" ? "/admin" : "/company-tasks", label: "Tasks", icon: "board" },
      { href: "/reviews", label: "Review queue", icon: "reports", active: true },
      { href: "/reports", label: "Reports", icon: "reports" },
    ]}
    userName={user.name || user.email}
    userEmail={user.email}
    userAction={<LogoutButton />}
    topbarRight={<span className="badge-pill text-xs text-[var(--accent)]">{user.role === "ADMIN" ? "Administrator" : "Manager"}</span>}
  >
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <section className="panel-card rounded-3xl p-5 sm:p-7"><p className="section-kicker">Approvals</p><h1 className="display-font mt-2 text-3xl text-white/95">Review submitted work</h1><p className="mt-2 text-sm text-white/50">Rate quality, leave feedback, then approve or request the next step.</p></section>
      <ReviewQueue />
    </div>
  </WorkspaceShell>;
}
