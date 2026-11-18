"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { departmentHref, type DepartmentOption } from "@/lib/employee-departments";

export default function AdminDepartmentSwitcher({ departments, selectedDepartment }: { departments: DepartmentOption[]; selectedDepartment: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchDepartment(id: string, refresh = false) {
    const next = new URLSearchParams(params.toString());
    next.delete("employee");
    next.delete("task");
    startTransition(() => {
      router.push(departmentHref(`${pathname}?${next}`, id), { scroll: false });
      if (refresh) router.refresh();
    });
  }

  async function createDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const values = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/departments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.get("name"), description: values.get("description") }),
      });
      const data = await response.json() as { ok?: boolean; error?: string; department?: DepartmentOption };
      if (!response.ok || !data.ok || !data.department) throw new Error(data.error || "Unable to create department.");
      setCreating(false);
      switchDepartment(data.department.id, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create department.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="workspace-surface mb-5 p-4" aria-label="Department controls" aria-busy={isPending}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className="grid min-w-0 gap-1.5 text-xs font-medium text-[var(--muted)]">View department
        <select className="soft-input h-10 w-full rounded-lg px-3 text-sm sm:min-w-64" value={selectedDepartment} disabled={isPending || saving} onChange={event => switchDepartment(event.target.value)}>
          <option value="ALL">All departments</option>
          <option value="UNASSIGNED">Unassigned employees only</option>
          {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="accent-button px-3 py-2 text-sm" disabled={saving || isPending} aria-expanded={creating} onClick={() => { setCreating(!creating); setError(null); }}>Create department</button>
        <Link className="secondary-button px-3 py-2 text-sm" href={departmentHref("/admin/employees#employees", selectedDepartment)}>Manage employees</Link>
        <Link className="secondary-button px-3 py-2 text-sm" href="/departments">Manage departments</Link>
      </div>
    </div>
    <p className="mt-2 text-xs text-[var(--muted)]">Unassigned employees appear in every department. Assign a department to place them in that group.</p>
    {creating ? <form onSubmit={event => void createDepartment(event)} className="mt-4 grid gap-3 border-t border-[var(--stroke)] pt-4 sm:grid-cols-2">
      <label className="workspace-field">Department name *<input name="name" required minLength={2} maxLength={100} autoFocus disabled={saving} placeholder="e.g. Operations" /></label>
      <label className="workspace-field">Description<input name="description" maxLength={500} disabled={saving} placeholder="Optional" /></label>
      <div className="flex gap-2 sm:col-span-2"><button className="accent-button px-4 py-2 text-sm" disabled={saving} aria-busy={saving}>{saving ? "Creating…" : "Create and view department"}</button><button type="button" className="secondary-button px-3 py-2 text-sm" disabled={saving} onClick={() => { setCreating(false); setError(null); }}>Cancel</button></div>
      {error ? <p role="alert" className="text-sm text-[var(--danger)] sm:col-span-2">{error}</p> : null}
    </form> : null}
  </section>;
}
