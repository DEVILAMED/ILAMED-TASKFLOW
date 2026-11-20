"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import UserAvatar from "@/app/user-avatar";

type Employee = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl?: string | null;
  leaveDays: readonly string[];
  role: "USER" | "MANAGER" | "ADMIN";
  isBlocked: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  profile: EmployeeProfile | null;
  taskSummary?: { assigned: number; completed: number; pending: number };
};
type EmployeeProfile = { employeeCode: string | null; phone: string | null; designation: string | null; joiningDate: string | null; employmentStatus: "ACTIVE" | "INACTIVE" | "ON_LEAVE"; departmentId: string | null; managerId: string | null };
type DepartmentOption = { id: string; name: string };
type ManagerOption = { id: string; name: string | null; email: string };

type PresenceSnapshot = {
  ok?: boolean;
  error?: string;
  employees?: { id: string; lastSeenAt: string | null }[];
};

const ONLINE_WINDOW_MS = 90_000;
const roleLabels: Record<Employee["role"], string> = { ADMIN: "Administrator", MANAGER: "Manager", USER: "Employee" };

function formatLastSeen(value: string | null, now: number) {
  if (!value) return "No recent activity";
  const elapsedMinutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));
  if (elapsedMinutes < 1) return "Active just now";
  if (elapsedMinutes === 1) return "Active 1 minute ago";
  if (elapsedMinutes < 60) return `Active ${elapsedMinutes} minutes ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours === 1) return "Active 1 hour ago";
  if (elapsedHours < 24) return `Active ${elapsedHours} hours ago`;
  return `Last active ${new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export default function EmployeePresence({ employees: initialEmployees, currentUserId, departments, managers, today }: { employees: Employee[]; currentUserId: string; departments: DepartmentOption[]; managers: ManagerOption[]; today: string }) {
  const [lastSeenById, setLastSeenById] = useState<Record<string, string | null>>(
    () => Object.fromEntries(initialEmployees.map((employee) => [employee.id, employee.lastSeenAt])),
  );
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Employee["role"] | "ALL">("ALL");
  const [employmentFilter, setEmploymentFilter] = useState("");
  const [accessFilter, setAccessFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filteredEmployees = initialEmployees.filter((employee) => {
    const query = search.trim().toLocaleLowerCase();
    return (roleFilter === "ALL" || employee.role === roleFilter)
      && (!employmentFilter || (employmentFilter === "UNRECORDED" ? !employee.profile : employee.profile?.employmentStatus === employmentFilter))
      && (!accessFilter || employee.isBlocked === (accessFilter === "blocked"))
      && (!managerFilter || (managerFilter === "UNASSIGNED" ? !employee.profile?.managerId : employee.profile?.managerId === managerFilter))
      && (!query || [employee.name, employee.email, roleLabels[employee.role], employee.profile?.employeeCode, employee.profile?.designation]
        .some((value) => value?.toLocaleLowerCase().includes(query)));
  });
  const pageCount = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleEmployees = filteredEmployees.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const refreshPresence = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/presence", { cache: "no-store" });
      const data = await response.json() as PresenceSnapshot;
      if (!response.ok || !data.ok || !data.employees) {
        throw new Error(data.error || "Unable to refresh employee presence.");
      }
      setLastSeenById(Object.fromEntries(data.employees.map((employee) => [employee.id, employee.lastSeenAt])));
      setNow(Date.now());
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh employee presence.");
    }
  }, []);

  useEffect(() => {
    void refreshPresence();
    const refreshInterval = window.setInterval(() => void refreshPresence(), 15_000);
    const clockInterval = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      window.clearInterval(refreshInterval);
      window.clearInterval(clockInterval);
    };
  }, [refreshPresence]);

  return (
    <div className="divide-y divide-white/[0.08]">
      {error ? <p role="alert" className="feedback-error mb-3 rounded-xl border px-3 py-2 text-xs">{error} Showing the last known status.</p> : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, email, employee ID…" aria-label="Search registered users" className="soft-input h-10 w-full max-w-md rounded-xl px-3 text-sm" />
        <select aria-label="Filter users by role" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value as Employee["role"] | "ALL"); setPage(1); }} className="soft-input h-10 rounded-xl px-3 text-sm">
          <option value="ALL">All roles</option>
          <option value="ADMIN">Administrators</option>
          <option value="MANAGER">Managers</option>
          <option value="USER">Employees</option>
        </select>
        <select aria-label="Filter by employment status" value={employmentFilter} onChange={event => { setEmploymentFilter(event.target.value); setPage(1); }} className="soft-input h-10 rounded-xl px-3 text-sm"><option value="">All employment statuses</option><option value="ACTIVE">Active</option><option value="ON_LEAVE">On leave</option><option value="INACTIVE">Inactive</option><option value="UNRECORDED">Not recorded</option></select>
        <select aria-label="Filter by login access" value={accessFilter} onChange={event => { setAccessFilter(event.target.value); setPage(1); }} className="soft-input h-10 rounded-xl px-3 text-sm"><option value="">All login access</option><option value="allowed">Login allowed</option><option value="blocked">Blocked</option></select>
        <select aria-label="Filter by reporting manager" value={managerFilter} onChange={event => { setManagerFilter(event.target.value); setPage(1); }} className="soft-input h-10 rounded-xl px-3 text-sm"><option value="">All reporting managers</option><option value="UNASSIGNED">Unassigned manager</option>{managers.map(manager => <option key={manager.id} value={manager.id}>{manager.name || manager.email}</option>)}</select>
        <button type="button" className="secondary-button px-3 py-2 text-sm" onClick={() => { setSearch(""); setRoleFilter("ALL"); setEmploymentFilter(""); setAccessFilter(""); setManagerFilter(""); setPage(1); }}>Clear filters</button>
        <span role="status" className="text-xs text-white/40">{filteredEmployees.length} of {initialEmployees.length} accounts</span>
      </div>
      {visibleEmployees.map((employee) => {
        const lastSeenAt = lastSeenById[employee.id] ?? null;
        const online = !employee.isBlocked && lastSeenAt !== null && now - new Date(lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
        return (
          <div key={employee.id} className="border-b border-white/[0.08] py-3 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <UserAvatar name={employee.name || employee.email} src={employee.avatarUrl} />
                <Link href={`/performance?employee=${encodeURIComponent(employee.id)}`} className="text-sm font-medium text-white/80 hover:underline">{employee.name || "Unnamed user"}</Link>
                <span className="badge-pill text-[10px]">{roleLabels[employee.role]}</span>
                {employee.leaveDays.includes(today) ? <span className="badge-pill text-[10px]">On leave today</span> : null}
                {employee.id === currentUserId ? <span className="text-xs font-medium text-[var(--accent)]">You</span> : null}
              </div>
              <p className="mt-1 text-xs text-white/40">{employee.email}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{employee.profile?.designation || roleLabels[employee.role]} / {departments.find(department => department.id === employee.profile?.departmentId)?.name || "Unassigned department"}{employee.isBlocked ? " / Login blocked" : ""}</p>
              <p className="mt-2 flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-slate-500"}`} />
                <span className={online ? "font-medium text-emerald-300" : "text-white/45"}>
                  {online ? "Online" : "Offline"}
                </span>
                <span className="text-white/35">{formatLastSeen(lastSeenAt, now)}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {employee.taskSummary ? <div className="flex gap-4 text-center text-xs text-[var(--muted)]">{[[employee.taskSummary.assigned, "Tasks"], [employee.taskSummary.completed, "Completed"], [employee.taskSummary.pending, "Pending"]].map(([count, label]) => <div key={label}><strong className="block text-base text-[var(--foreground)]">{count}</strong>{label}</div>)}</div> : null}
              <Link href={`/performance?employee=${encodeURIComponent(employee.id)}`} className="secondary-button px-3 py-2 text-sm">View profile</Link>
            </div>
            </div>
          </div>
        );
      })}
      {!filteredEmployees.length ? <p role="status" className="py-6 text-sm text-[var(--muted)]">No registered users match these filters.</p> : null}
      {pageCount > 1 ? <div className="mt-3 flex items-center justify-between"><p className="text-xs text-white/40">Page {currentPage} of {pageCount}</p><div className="flex gap-2"><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="secondary-button px-3 py-2 text-xs disabled:opacity-40">Previous</button><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="secondary-button px-3 py-2 text-xs disabled:opacity-40">Next</button></div></div> : null}
    </div>
  );
}
