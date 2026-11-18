import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceShell } from "@/app/workspace-shell";
import LogoutButton from "@/app/dashboard/logout-button";
import { prisma } from "@/lib/prisma";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await prisma.employeeProfile.findUnique({ where: { userId: user.id }, select: { designation: true } });
  const teams = user.role === "MANAGER" ? await prisma.teamMembership.findMany({ where: { userId: user.id, role: "MANAGER" }, select: { teamId: true } }) : [];
  const [employees, departments] = await Promise.all([user.role === "USER" ? [] : prisma.user.findMany({ where: {
    role: { not: "ADMIN" }, isBlocked: false,
    OR: [{ employeeProfile: null }, { employeeProfile: { employmentStatus: { not: "INACTIVE" } } }],
    ...(user.role === "MANAGER" ? { teamMemberships: { some: { teamId: { in: teams.map(team => team.teamId) } } } } : {}),
  }, select: { id: true, name: true, email: true, employeeProfile: { select: { departmentId: true } } }, orderBy: [{ name: "asc" }, { email: "asc" }] }),
  user.role === "ADMIN" ? prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
  ]);

  return <WorkspaceShell title="Team workspace" currentWorkspace="projects" userRole={user.role} userId={user.id} userName={user.name || user.email} userEmail={user.email} userAvatarUrl={user.avatarUrl} userDesignation={profile?.designation ?? undefined} userAction={<LogoutButton />} taskEmployees={employees} taskDepartments={departments}>
    {children}
  </WorkspaceShell>;
}
