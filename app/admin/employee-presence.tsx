"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UserRoleControl from "./user-role-control";

type Employee = {
  id: string;
  name: string | null;
  email: string;
  role: "USER" | "MANAGER" | "ADMIN";
  isBlocked: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  profile: EmployeeProfile | null;
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

export default function EmployeePresence({ employees: initialEmployees, departments, managers }: { employees: Employee[]; departments: DepartmentOption[]; managers: ManagerOption[] }) {
  const router = useRouter();
  const [lastSeenById, setLastSeenById] = useState<Record<string, string | null>>(
    () => Object.fromEntries(initialEmployees.map((employee) => [employee.id, employee.lastSeenAt])),
  );
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filteredEmployees = initialEmployees.filter((employee) => {
    const query = search.trim().toLocaleLowerCase();
    return !query || [employee.name, employee.email, employee.profile?.employeeCode, employee.profile?.designation]
      .some((value) => value?.toLocaleLowerCase().includes(query));
  });
  const pageCount = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const visibleEmployees = filteredEmployees.slice((page - 1) * pageSize, page * pageSize);

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
      {error ? <p role="alert" className="mb-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{error} Showing the last known status.</p> : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, email, employee ID…" aria-label="Search employees" className="soft-input h-10 w-full max-w-md rounded-xl px-3 text-sm" />
        <span className="text-xs text-white/40">{filteredEmployees.length} employees</span>
      </div>
      {visibleEmployees.map((employee) => {
        const lastSeenAt = lastSeenById[employee.id] ?? null;
        const online = !employee.isBlocked && lastSeenAt !== null && now - new Date(lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
        return (
          <div key={employee.id} className="border-b border-white/[0.08] py-3 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/80">{employee.name || "Unnamed employee"}</p>
              <p className="mt-1 text-xs text-white/40">{employee.email}</p>
              <p className="mt-2 flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-slate-500"}`} />
                <span className={online ? "font-medium text-emerald-300" : "text-white/45"}>
                  {online ? "Online" : "Offline"}
                </span>
                <span className="text-white/35">{formatLastSeen(lastSeenAt, now)}</span>
              </p>
            </div>
            <UserRoleControl
              userId={employee.id}
              role={employee.role}
              isBlocked={employee.isBlocked}
              displayName={employee.name || employee.email}
              isCurrentUser={false}
            />
            </div>
            <EmployeeProfileEditor employeeId={employee.id} profile={employee.profile} departments={departments} managers={managers} onSaved={() => router.refresh()} />
          </div>
        );
      })}
      {pageCount > 1 ? <div className="mt-3 flex items-center justify-between"><p className="text-xs text-white/40">Page {page} of {pageCount}</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="secondary-button px-3 py-2 text-xs disabled:opacity-40">Previous</button><button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} className="secondary-button px-3 py-2 text-xs disabled:opacity-40">Next</button></div></div> : null}
    </div>
  );
}

function EmployeeProfileEditor({ employeeId, profile, departments, managers, onSaved }: {
  employeeId: string; profile: EmployeeProfile | null; departments: DepartmentOption[]; managers: ManagerOption[]; onSaved: () => void;
}) {
  const [employeeCode, setEmployeeCode] = useState(profile?.employeeCode ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [designation, setDesignation] = useState(profile?.designation ?? "");
  const [joiningDate, setJoiningDate] = useState(profile?.joiningDate ?? "");
  const [employmentStatus, setEmploymentStatus] = useState<EmployeeProfile["employmentStatus"]>(profile?.employmentStatus ?? "ACTIVE");
  const [departmentId, setDepartmentId] = useState(profile?.departmentId ?? "");
  const [managerId, setManagerId] = useState(profile?.managerId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null); setSaved(false);
    try {
      const response = await fetch(`/api/admin/users/${employeeId}/profile`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode, phone, designation, joiningDate: joiningDate || null, employmentStatus, departmentId: departmentId || null, managerId: managerId || null }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save the employee profile.");
      setSaved(true); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save employee profile."); }
    finally { setPending(false); }
  }

  return <details className="basis-full rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
    <summary className="cursor-pointer text-xs font-medium text-white/60">{profile ? "Employee profile" : "Add employee profile"}</summary>
    <form onSubmit={(event) => void save(event)} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="grid gap-1 text-[11px] text-white/45">Employee ID<input maxLength={40} value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs" /></label>
      <label className="grid gap-1 text-[11px] text-white/45">Phone<input maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs" /></label>
      <label className="grid gap-1 text-[11px] text-white/45">Designation<input maxLength={100} value={designation} onChange={(event) => setDesignation(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs" /></label>
      <label className="grid gap-1 text-[11px] text-white/45">Joining date<input type="date" value={joiningDate} onChange={(event) => setJoiningDate(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs" /></label>
      <label className="grid gap-1 text-[11px] text-white/45">Employment status<select value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value as EmployeeProfile["employmentStatus"])} className="soft-input h-9 rounded-lg px-2 text-xs"><option value="ACTIVE">Active</option><option value="ON_LEAVE">On leave</option><option value="INACTIVE">Inactive</option></select></label>
      <label className="grid gap-1 text-[11px] text-white/45">Department<select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs"><option value="">Unassigned</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
      <label className="grid gap-1 text-[11px] text-white/45 sm:col-span-2">Reporting manager<select value={managerId} onChange={(event) => setManagerId(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs"><option value="">Unassigned</option>{managers.filter((manager) => manager.id !== employeeId).map((manager) => <option key={manager.id} value={manager.id}>{manager.name || manager.email}</option>)}</select></label>
      <div className="flex items-end gap-3"><button disabled={pending} className="secondary-button h-9 px-3 text-xs font-semibold disabled:opacity-50">{pending ? "Saving…" : "Save profile"}</button>{saved ? <span role="status" className="pb-2 text-xs text-emerald-300">Saved</span> : null}</div>
      {error ? <p role="alert" className="text-xs text-rose-300 sm:col-span-2">{error}</p> : null}
    </form>
  </details>;
}
