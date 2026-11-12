import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/app/dashboard/logout-button";
import EmployeePresence from "../employee-presence";

export default async function EmployeesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "ADMIN") redirect("/dashboard");
  const [users, departments] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "ADMIN" } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true, isBlocked: true, createdAt: true, lastSeenAt: true,
        employeeProfile: { select: { employeeCode: true, phone: true, designation: true, joiningDate: true, employmentStatus: true, departmentId: true, managerId: true } },
      },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return <WorkspaceShell title="Employees" currentWorkspace="projects" navItems={[
        { href: "/admin", label: "Tasks", icon: "board" },
        { href: "/admin/overview", label: "Company overview", icon: "dashboard" },
        { href: "/reviews", label: "Reviews", icon: "activity" },
        { href: "/admin/employees", label: "Employees", icon: "team", active: true },
        { href: "/departments", label: "Departments", icon: "team" },
        { href: "/reports", label: "Reports", icon: "reports" },
  ]} userName={currentUser.name || currentUser.email} userEmail={currentUser.email} userAction={<LogoutButton />}>
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

  </WorkspaceShell>;
}
