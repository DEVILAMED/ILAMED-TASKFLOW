"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, ListChecks, Star, Sun, TriangleAlert } from "lucide-react";
import { personalSummary, type PersonalList, type PersonalTask } from "@/lib/personal-tasks";
import { personalDue, PersonalTaskTable } from "./personal-task-views";

export default function PersonalOverview({ tasks, lists, today, pending, onOpen, onUpdate }: { tasks: PersonalTask[]; lists: PersonalList[]; today: string; pending: boolean; onOpen: (id: string) => void; onUpdate: (id: string, changes: Record<string, unknown>) => void }) {
  const summary = personalSummary(tasks, today);
  const metrics = [
    { label: "Total tasks", value: summary.total, icon: ListChecks, href: "/todos?section=tasks", tone: "assigned" },
    { label: "Open tasks", value: summary.active, icon: Clock3, href: "/todos?section=tasks&status=active", tone: "progress" },
    { label: "My Day", value: summary.myDay, icon: Sun, href: "/todos?section=my-day&status=active", tone: "assigned" },
    { label: "Important", value: summary.important, icon: Star, href: "/todos?section=important&status=active", tone: "assigned" },
    { label: "Overdue", value: summary.overdue, icon: TriangleAlert, href: "/todos?section=tasks&due=overdue", tone: "overdue" },
    { label: "Completed", value: summary.completed, icon: CheckCircle2, href: "/todos?section=tasks&status=completed", tone: "completed" },
  ];
  const upcoming = tasks.filter(task => !task.isCompleted && task.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).slice(0, 5);
  const recent = [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const rows = [{ label: "Open tasks", value: summary.active, color: "#2443b3" }, { label: "Completed", value: summary.completed, color: "#11958d" }];
  const circumference = 2 * Math.PI * 62;
  let offset = 0;
  return <>
    <section className="employee-dashboard-stats" aria-label="Personal task summary">{metrics.map(({ label, value, icon: Icon, href, tone }) => <Link key={label} href={href} className={`employee-summary-card metric-${tone}`}><div><span>{label}</span><strong>{value}</strong></div><Icon size={19} strokeWidth={1.7}/></Link>)}</section>
    <section className="employee-dashboard-panels">
      <article className="workspace-surface"><div className="employee-panel-heading"><h2>Upcoming deadlines</h2><Link href="/todos?section=calendar">VIEW CALENDAR <ArrowRight size={12}/></Link></div>{upcoming.length ? <div className="personal-upcoming">{upcoming.map(task => <button type="button" key={task.id} onClick={() => onOpen(task.id)}><div><strong>{task.title}</strong><span>{task.list.name}{task.important ? " · Important" : ""}</span></div><time className={task.dueDate!.slice(0, 10) < today ? "personal-overdue" : ""} dateTime={task.dueDate!}>{personalDue(task.dueDate)}</time></button>)}</div> : <p className="employee-dashboard-empty">No upcoming deadlines. Add a due date to plan your next task.</p>}</article>
      <article className="workspace-surface"><h2>Status Distribution</h2><div className="employee-task-distribution"><svg viewBox="0 0 180 180" role="img" aria-label={`${summary.active} open tasks and ${summary.completed} completed tasks`}><circle cx="90" cy="90" r="62" fill="none" stroke="var(--stroke)" strokeWidth="24"/>{rows.map(row => { const size = tasks.length ? row.value / tasks.length * circumference : 0; const previous = offset; offset += size; return row.value ? <circle key={row.label} cx="90" cy="90" r="62" fill="none" stroke={row.color} strokeWidth="24" strokeDasharray={`${Math.max(0, size - 3)} ${circumference}`} strokeDashoffset={-previous} transform="rotate(-90 90 90)"/> : null; })}<text x="90" y="88" textAnchor="middle" fill="var(--foreground)" fontSize="24" fontWeight="600">{summary.total}</text><text x="90" y="107" textAnchor="middle" fill="var(--muted)" fontSize="10">total tasks</text></svg><div>{rows.map(row => <p key={row.label}><i style={{ background: row.color }}/><span>{row.label}</span><strong>{row.value}</strong></p>)}<p><span>Completion rate</span><strong>{tasks.length ? `${Math.round(summary.completed / tasks.length * 100)}%` : "—"}</strong></p><p><span>Lists</span><strong>{lists.length}</strong></p></div></div></article>
    </section>
    <section className="workspace-task-results panel-card personal-recent"><div className="employee-panel-heading"><h2>Recent tasks</h2><Link href="/todos?section=tasks">VIEW ALL <ArrowRight size={12}/></Link></div>{recent.length ? <PersonalTaskTable tasks={recent} today={today} pending={pending} onOpen={onOpen} onUpdate={onUpdate}/> : <p className="personal-empty">Your tasks will appear here. Choose New Task to create your first one.</p>}</section>
  </>;
}
