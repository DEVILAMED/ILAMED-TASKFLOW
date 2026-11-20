import Link from "next/link";

type Member = {
  email: string; role: string; isBlocked: boolean; createdAt: Date; lastSeenAt: Date | null;
  employeeProfile: {
    employeeCode: string | null; phone: string | null; designation: string | null; joiningDate: Date | null; employmentStatus: string;
    department: { name: string } | null; manager: { name: string | null; email: string } | null;
  } | null;
  teamMemberships: { role: string; team: { id: string; name: string } }[];
};
const formatDate = (date: Date | null) => date ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "Not recorded";

export default function TeamMemberDetails({ employee, leaveDays, backHref }: { employee: Member; leaveDays: readonly string[]; backHref: string }) {
  const profile = employee.employeeProfile;
  const fields = [
    ["Email", employee.email], ["Phone", profile?.phone], ["Employee ID", profile?.employeeCode],
    ["Designation", profile?.designation], ["Department", profile?.department?.name],
    ["Reporting manager", profile?.manager ? profile.manager.name || profile.manager.email : "Unassigned"],
    ["Role", employee.role === "USER" ? "Employee" : employee.role === "MANAGER" ? "Manager" : "Administrator"],
    ["Employment status", profile?.employmentStatus.replaceAll("_", " ").toLowerCase()],
    ["Login access", employee.isBlocked ? "Blocked" : "Allowed"], ["Joining date", formatDate(profile?.joiningDate ?? null)],
    ["Account created", formatDate(employee.createdAt)],
    ["Last active", employee.lastSeenAt ? employee.lastSeenAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "No recent activity"],
  ];
  return <section className="workspace-surface" aria-labelledby="member-profile-heading">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="member-profile-heading">Profile details</h2><Link href={backHref} className="text-sm text-[var(--accent)] hover:underline">Back to {backHref === "/dashboard" ? "dashboard" : "team"}</Link></div>
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">{fields.map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 break-words text-sm text-[var(--foreground)]">{value || "Not recorded"}</dd></div>)}</dl>
    <div className="mt-5 border-t border-[var(--stroke)] pt-4"><h3 className="text-sm font-semibold">Teams</h3>{employee.teamMemberships.length ? <ul className="mt-2 flex flex-wrap gap-2">{employee.teamMemberships.map(membership => <li key={membership.team.id} className="badge-pill text-xs">{membership.team.name} - {membership.role === "MANAGER" ? "Manager" : "Member"}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">No team memberships.</p>}</div>
    <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Recorded leave ({leaveDays.length} days)</summary>{leaveDays.length ? <ul className="mt-2 flex max-h-48 flex-wrap gap-2 overflow-auto">{leaveDays.map(day => <li key={day} className="badge-pill text-xs"><time dateTime={day}>{day}</time></li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">No recorded leave.</p>}</details>
  </section>;
}
