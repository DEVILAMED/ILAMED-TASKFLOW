"use client";

import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { employeeDayKey } from "@/lib/employee-dashboard";

type CalendarTask = { id: string; title: string; dueDate: string | null; status: string };
function validDay(value: string | null): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime()) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value); }

export default function EmployeeTaskCalendar({ tasks, onOpen }: { tasks: CalendarTask[]; onOpen: (task: CalendarTask) => void }) {
  const params = useSearchParams();
  const today = employeeDayKey();
  const day = params.get("day");
  const selected = validDay(day) ? day : today;
  const monthParam = params.get("month");
  const monthKey = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : selected.slice(0,7);
  const month = new Date(`${monthKey}-01T12:00:00Z`);
  const days = new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
  const offset = month.getUTCDay();
  const cells = Array.from({length:Math.ceil((offset+days)/7)*7},(_,index)=>new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),index-offset+1,12)));
  const agenda = tasks.filter(task=>task.dueDate?.slice(0,10) === selected);
  function choose(value: Date) { const date = value.toISOString().slice(0,10); const url = new URL(window.location.href); url.searchParams.set("day",date);url.searchParams.set("month",date.slice(0,7));window.history.replaceState(null,"",url); }
  function move(delta: number) { choose(new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+delta,1,12))); }
  return <div className="employee-calendar-layout">
    <section className="workspace-surface employee-calendar-picker" aria-label="Choose a due date"><div className="employee-calendar-inner"><div className="employee-calendar-heading"><button type="button" aria-label="Previous month" onClick={()=>move(-1)}><ChevronLeft size={17}/></button><h2>{month.toLocaleDateString("en-US",{month:"long",year:"numeric",timeZone:"UTC"})}</h2><button type="button" aria-label="Next month" onClick={()=>move(1)}><ChevronRight size={17}/></button></div><div className="employee-calendar-grid">{["Su","Mo","Tu","We","Th","Fr","Sa"].map(label=><span key={label} className="employee-calendar-weekday">{label}</span>)}{cells.map(date=>{const key=date.toISOString().slice(0,10);const count=tasks.filter(task=>task.dueDate?.slice(0,10)===key).length;return <button key={key} type="button" data-calendar-day={key} aria-pressed={key===selected} aria-current={key===today?"date":undefined} aria-label={`${date.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"})}${count?`, ${count} tasks due`:""}`} className={`${date.getUTCMonth()!==month.getUTCMonth()?"is-outside":""} ${key===selected?"is-selected":""} ${count?"has-tasks":""}`} onClick={()=>choose(date)}>{date.getUTCDate()}</button>;})}</div></div></section>
    <section className="workspace-surface employee-calendar-agenda" aria-label="Daily agenda"><h2>Due on {new Date(`${selected}T12:00:00Z`).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"})}</h2>{agenda.length?<div className="employee-calendar-items">{agenda.map(task=><button key={task.id} type="button" onClick={()=>onOpen(task)}><strong>{task.title}</strong><span className={`employee-task-status status-${task.status.toLowerCase()}`}>{task.status.replaceAll("_"," ")}</span></button>)}</div>:<p>Nothing is due this day.</p>}</section>
  </div>;
}
