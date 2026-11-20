"use client";

import { useState } from "react";

export type EmployeeProfile = { employeeCode: string | null; phone: string | null; designation: string | null; joiningDate: string | null; employmentStatus: "ACTIVE" | "INACTIVE" | "ON_LEAVE"; departmentId: string | null; managerId: string | null };
export type ManagerOption = { id: string; name: string | null; email: string };

export default function EmployeeProfileEditor({ employeeId, profile, managers, onSaved }: {
  employeeId: string; profile: EmployeeProfile | null; managers: ManagerOption[]; onSaved: () => void;
}) {
  const [employeeCode, setEmployeeCode] = useState(profile?.employeeCode ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [designation, setDesignation] = useState(profile?.designation ?? "");
  const [joiningDate, setJoiningDate] = useState(profile?.joiningDate ?? "");
  const [employmentStatus, setEmploymentStatus] = useState<EmployeeProfile["employmentStatus"]>(profile?.employmentStatus ?? "ACTIVE");
  const [managerId, setManagerId] = useState(profile?.managerId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null); setSaved(false);
    try {
      const response = await fetch(`/api/admin/users/${employeeId}/profile`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode, phone, designation, joiningDate: joiningDate || null, employmentStatus, managerId: managerId || null }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save the employee profile.");
      setSaved(true); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save employee profile."); }
    finally { setPending(false); }
  }

  return <div>
    <form onSubmit={(event) => void save(event)} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="grid gap-1 text-[11px] text-white/45">Employee ID<input maxLength={40} value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs" /></label>
      <label className="grid gap-1 text-[11px] text-white/45">Phone<input maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs" /></label>
      <label className="grid gap-1 text-[11px] text-white/45">Designation<input maxLength={100} value={designation} onChange={(event) => setDesignation(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs" /></label>
      <label className="grid gap-1 text-[11px] text-white/45">Joining date<input type="date" value={joiningDate} onChange={(event) => setJoiningDate(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs" /></label>
      <label className="grid gap-1 text-[11px] text-white/45">Employment status<select value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value as EmployeeProfile["employmentStatus"])} className="soft-input h-9 rounded-lg px-2 text-xs"><option value="ACTIVE">Active</option><option value="ON_LEAVE">On leave</option><option value="INACTIVE">Inactive</option></select></label>
      <label className="grid gap-1 text-[11px] text-white/45 sm:col-span-2">Reporting manager<select value={managerId} onChange={(event) => setManagerId(event.target.value)} className="soft-input h-9 rounded-lg px-2 text-xs"><option value="">Unassigned</option>{managers.filter((manager) => manager.id !== employeeId).map((manager) => <option key={manager.id} value={manager.id}>{manager.name || manager.email}</option>)}</select></label>
      <div className="flex items-end gap-3"><button disabled={pending} className="secondary-button h-9 px-3 text-xs font-semibold disabled:opacity-50">{pending ? "Saving…" : "Save profile"}</button>{saved ? <span role="status" className="pb-2 text-xs feedback-success-text">Saved</span> : null}</div>
      {error ? <p role="alert" className="text-xs feedback-error-text sm:col-span-2">{error}</p> : null}
    </form>
  </div>;
}
