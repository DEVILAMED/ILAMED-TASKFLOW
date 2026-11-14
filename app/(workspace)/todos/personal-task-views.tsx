"use client";

import { Check, Repeat2, Star } from "lucide-react";
import type { PersonalTask } from "@/lib/personal-tasks";

export function personalDue(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "No due date";
}

export function PersonalTaskTable({ tasks, today, pending, onOpen, onUpdate }: { tasks: PersonalTask[]; today: string; pending: boolean; onOpen: (id: string) => void; onUpdate: (id: string, changes: Record<string, unknown>) => void }) {
  function title(task: PersonalTask) {
    return <div className="personal-task-title"><button type="button" className={`personal-complete-toggle ${task.isCompleted ? "is-completed" : ""}`} aria-label={`${task.isCompleted ? "Reopen" : "Complete"} ${task.title}`} aria-pressed={task.isCompleted} disabled={pending} onClick={() => onUpdate(task.id, { isCompleted: !task.isCompleted })}>{task.isCompleted ? <Check size={12}/> : null}</button><div><button type="button" onClick={() => onOpen(task.id)} className={`personal-task-open ${task.isCompleted ? "is-completed" : ""}`}>{task.title}</button>{task.note ? <p>{task.note}</p> : null}</div>{task.repeat ? <Repeat2 size={13} aria-label="Repeating task"/> : null}</div>;
  }
  function due(task: PersonalTask) { const overdue = !task.isCompleted && task.dueDate && task.dueDate.slice(0, 10) < today; return <span className={overdue ? "personal-overdue" : ""}>{personalDue(task.dueDate)}{overdue ? <small>Overdue</small> : null}</span>; }
  return <>
    <div className="personal-mobile-tasks">{tasks.map(task => <article key={task.id}>{title(task)}<div className="personal-mobile-task-meta"><span>{task.list.name}</span>{due(task)}<span className={`employee-task-status status-${task.isCompleted ? "done" : "todo"}`}>{task.isCompleted ? "Completed" : "Not completed"}</span></div></article>)}</div>
    <div className="personal-table-scroll"><table className="w-full min-w-[850px] text-left"><thead><tr><th>Task</th><th>List</th><th>Due date</th><th>Importance</th><th>Status</th><th>Checklist</th><th>Updated</th></tr></thead><tbody>{tasks.map(task => <tr key={task.id}>
      <td>{title(task)}</td><td>{task.list.name}</td><td className="personal-table-date">{due(task)}</td>
      <td><button type="button" className={`personal-important-toggle ${task.important ? "is-important" : ""}`} aria-label={`${task.important ? "Unmark" : "Mark"} ${task.title} as important`} aria-pressed={task.important} disabled={pending} onClick={() => onUpdate(task.id, { important: !task.important })}><Star size={12} fill={task.important ? "currentColor" : "none"}/>{task.important ? "Important" : "Normal"}</button></td>
      <td><span className={`employee-task-status status-${task.isCompleted ? "done" : "todo"}`}>{task.isCompleted ? "Completed" : "Not completed"}</span></td>
      <td className="personal-table-date">{task.steps.length ? `${task.steps.filter(step => step.isCompleted).length}/${task.steps.length}` : "—"}</td><td className="personal-table-date"><time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time></td>
    </tr>)}</tbody></table></div>
  </>;
}

export function PersonalTaskBoard({ tasks, pending, onOpen, onUpdate }: { tasks: PersonalTask[]; pending: boolean; onOpen: (id: string) => void; onUpdate: (id: string, changes: Record<string, unknown>) => void }) {
  return <div className="personal-kanban">{[false, true].map(completed => <section key={String(completed)}><h2>{completed ? "Completed" : "Not completed"}<span>{tasks.filter(task => task.isCompleted === completed).length}</span></h2><div>{tasks.filter(task => task.isCompleted === completed).map(task => <article key={task.id}><button type="button" className="personal-task-open" onClick={() => onOpen(task.id)}>{task.title}</button><p>{task.list.name} · {personalDue(task.dueDate)}</p><div><span>{task.important ? "★ Important" : "Normal"}</span><button type="button" disabled={pending} onClick={() => onUpdate(task.id, { isCompleted: !task.isCompleted })}>{task.isCompleted ? "Reopen" : "Complete"}</button></div></article>)}{!tasks.some(task => task.isCompleted === completed) ? <p className="personal-muted">No tasks in this column.</p> : null}</div></section>)}</div>;
}
