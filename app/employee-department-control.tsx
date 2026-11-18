"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DepartmentOption } from "@/lib/employee-departments";

export default function EmployeeDepartmentControl({ employeeId, employeeName, departmentId, departments, showLabel = true }: {
  employeeId: string; employeeName: string; departmentId: string | null; departments: DepartmentOption[]; showLabel?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function assign(value: string) {
    if (saving || refreshing) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${employeeId}/profile`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: value || null }),
      });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to assign department.");
      setSaved(true);
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to assign department.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="min-w-0 max-w-64 text-left">
    <label className="grid gap-1 text-xs text-[var(--muted)]"><span className={showLabel ? undefined : "sr-only"}>Department</span>
      <select aria-label={`Department for ${employeeName}`} className="soft-input h-9 w-full min-w-0 rounded-lg px-2 text-xs" value={departmentId ?? ""} disabled={saving || refreshing} aria-busy={saving || refreshing} onChange={event => void assign(event.target.value)}>
        <option value="">Unassigned</option>
        {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select>
    </label>
    {error ? <p role="alert" className="mt-1 text-xs text-[var(--danger)]">{error}</p> : null}
    {saved ? <span role="status" className="sr-only">Department updated for {employeeName}.</span> : null}
  </div>;
}
