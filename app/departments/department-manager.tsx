"use client";

import { useState } from "react";

type Employee = { id: string; name: string | null; email: string };
type Department = { id: string; name: string; description: string | null; headId: string | null; head: { name: string | null; email: string } | null; _count: { employees: number } };

export default function DepartmentManager({ initialDepartments, employees }: { initialDepartments: Department[]; employees: Employee[] }) {
  const [departments, setDepartments] = useState(initialDepartments);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [headId, setHeadId] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault(); setPending(true); setError(null); setNotice(null);
    try {
      const response = await fetch(id ? `/api/departments/${id}` : "/api/departments", {
        method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, headId: headId || null }),
      });
      const data = await response.json() as { ok?: boolean; error?: string; department?: Department };
      if (!response.ok || !data.ok || !data.department) throw new Error(data.error || "Unable to save department.");
      const hydrated = { ...data.department, head: employees.find((employee) => employee.id === data.department!.headId) ?? null, _count: departments.find((department) => department.id === id)?._count ?? { employees: 0 } };
      setDepartments((current) => id ? current.map((item) => item.id === id ? hydrated : item) : [...current, hydrated].sort((a, b) => a.name.localeCompare(b.name)));
      setName(""); setDescription(""); setHeadId(""); setEditing(null); setNotice(id ? "Department updated." : "Department created.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save department."); }
    finally { setPending(false); }
  }

  async function remove(department: Department) {
    if (!window.confirm(`Delete ${department.name}?`)) return;
    setPending(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/departments/${department.id}`, { method: "DELETE" });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to delete department.");
      setDepartments((current) => current.filter((item) => item.id !== department.id)); setNotice("Department deleted.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete department."); }
    finally { setPending(false); }
  }

  function beginEdit(department: Department) { setEditing(department.id); setName(department.name); setDescription(department.description ?? ""); setHeadId(department.headId ?? ""); }

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
    <section className="panel-card rounded-3xl p-5">
      <h2 className="text-lg font-semibold text-white/90">Departments</h2>
      <div className="mt-3 divide-y divide-white/[0.08]">
        {departments.map((department) => <article key={department.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div><h3 className="font-medium text-white/85">{department.name}</h3><p className="mt-1 text-xs text-white/45">{department._count.employees} employees · Head: {department.head?.name || department.head?.email || "Not assigned"}</p>{department.description ? <p className="mt-1 text-xs text-white/35">{department.description}</p> : null}</div>
          <div className="flex gap-2"><button type="button" onClick={() => beginEdit(department)} className="secondary-button px-3 py-2 text-xs">Edit</button><button type="button" onClick={() => void remove(department)} disabled={pending || department._count.employees > 0} title={department._count.employees ? "Move employees before deleting" : undefined} className="secondary-button px-3 py-2 text-xs disabled:opacity-40">Delete</button></div>
        </article>)}
        {!departments.length ? <p className="py-6 text-sm text-white/45">No departments yet.</p> : null}
      </div>
    </section>
    <section className="panel-card h-fit rounded-3xl p-5">
      <h2 className="text-lg font-semibold text-white/90">{editing ? "Edit department" : "Create department"}</h2>
      <form className="mt-4 grid gap-3" onSubmit={(event) => void save(event, editing ?? undefined)}>
        <label className="grid gap-1.5 text-xs text-white/55">Name<input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="soft-input h-10 rounded-lg px-3 text-sm" /></label>
        <label className="grid gap-1.5 text-xs text-white/55">Description<textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="soft-input min-h-20 rounded-lg px-3 py-2 text-sm" /></label>
        <label className="grid gap-1.5 text-xs text-white/55">Department head<select value={headId} onChange={(event) => setHeadId(event.target.value)} className="soft-input h-10 rounded-lg px-2 text-sm"><option value="">Not assigned</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name || employee.email}</option>)}</select></label>
        <div className="flex gap-2"><button disabled={pending} className="primary-button px-4 py-2 text-sm disabled:opacity-50">{pending ? "Saving…" : editing ? "Save changes" : "Create department"}</button>{editing ? <button type="button" onClick={() => { setEditing(null); setName(""); setDescription(""); setHeadId(""); }} className="secondary-button px-4 py-2 text-sm">Cancel</button> : null}</div>
      </form>
      {error ? <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p> : null}{notice ? <p role="status" className="mt-3 text-xs text-emerald-300">{notice}</p> : null}
    </section>
  </div>;
}
