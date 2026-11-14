import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmployeePresence from "../employee-presence";
import Link from "next/link";
import WorkspacePageHeading from "@/app/workspace-page-heading";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

export default async function EmployeesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") redirect("/dashboard");
  const [users, departments, tasks, reviews] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "ADMIN" } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true, isBlocked: true, createdAt: true, lastSeenAt: true,
        employeeProfile: { select: { employeeCode: true, phone: true, designation: true, joiningDate: true, employmentStatus: true, departmentId: true, managerId: true } },
      },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.task.findMany({ where: { projectId: COMPANY_TASK_PROJECT_ID }, select: { assigneeId: true, status: true } }),
    prisma.taskReview.findMany({ where: { rating: { not: null }, submission: { task: { projectId: COMPANY_TASK_PROJECT_ID } } }, select: { rating: true, submission: { select: { task: { select: { assigneeId: true } } } } } }),
  ]);
  return <>
    <div className="workspace-view"><WorkspacePageHeading kicker="ROSTER" title="Team" />
      <section className="workspace-team-grid" aria-label="Team members">{users.map(employee => {
        const assigned = tasks.filter(task => task.assigneeId === employee.id);
        const done = assigned.filter(task => ["APPROVED","DONE"].includes(task.status)).length;
        const pending = assigned.filter(task => !["APPROVED","DONE","REJECTED","CANCELLED"].includes(task.status)).length;
        const ratings = reviews.filter(review => review.submission.task.assigneeId === employee.id);
        const score = ratings.length ? Math.round(ratings.reduce((sum,review)=>sum+(review.rating || 0),0)/ratings.length*20) : null;
        const name = employee.name || employee.email;
        return <Link key={employee.id} href={`/performance?employee=${encodeURIComponent(employee.id)}`} className="workspace-surface workspace-team-card"><div className="workspace-team-person"><span className="workspace-team-avatar">{name.split(/\s+/).map(part=>part[0]).slice(0,2).join("").toUpperCase()}</span><div><h2>{name}</h2><p>{employee.employeeProfile?.designation || (employee.role === "MANAGER" ? "Team manager" : "Team member")}</p></div><span className={`workspace-score-badge ${score !== null && score >= 70 ? "is-good" : ""}`} title="Average manager review rating converted to 100">{score === null ? "Not rated" : `${score} · ${score>=70?"Good":"Needs review"}`}</span></div><div className="workspace-team-counts">{[[assigned.length,"Tasks"],[done,"Done"],[pending,"Pending"],["—","Logged"]].map(([value,label])=><div key={String(label)}><strong>{value}</strong><span>{label}</span></div>)}</div></Link>;
      })}</section>{!users.length ? <div className="workspace-empty-panel">No employees have joined yet.</div> : null}
    </div>
    <details className="workspace-additional"><summary>Manage employee accounts</summary><div className="mb-4 mt-4"><Link href="/departments" className="secondary-button workspace-standard-button">Manage departments</Link></div>
        <section id="employees" className="panel-card rounded-3xl p-5 sm:p-7">
          <div className="mb-4">
            <p className="section-kicker">People</p>
            <h2 className="mt-2 text-xl font-semibold text-white/90">Employees</h2>
            <p className="mt-1 text-sm text-white/45">Employee accounts can view their assigned tasks and update progress.</p>
          </div>
          {users.length ? (
            <EmployeePresence
              employees={users.map((employee) => ({
                ...employee,
                createdAt: employee.createdAt.toISOString(),
                lastSeenAt: employee.lastSeenAt?.toISOString() ?? null,
                profile: employee.employeeProfile ? { ...employee.employeeProfile, joiningDate: employee.employeeProfile.joiningDate?.toISOString().slice(0, 10) ?? null } : null,
              }))}
              departments={departments}
              managers={users.filter((employee) => !employee.isBlocked).map(({ id, name, email }) => ({ id, name, email }))}
            />
          ) : (
            <p className="text-sm text-white/45">No employee accounts yet. Employees can create accounts to receive assigned tasks.</p>
          )}
        </section>

    </details>
  </>;
}
