"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import WorkspacePageHeading from "@/app/workspace-page-heading";

export type ReportTask = { title: string; assignee: string; assigneeId: string; departmentId: string; department: string; dueDate: string | null; status: string; priority: string; startDate: string; deadline: string; workingDays: number | null; createdAt: string };
const closed = (status: string) => ["APPROVED","DONE"].includes(status);
const creationDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");

export default function ReportDownloads({ tasks }: { tasks: ReportTask[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [employee, setEmployee] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [dateField, setDateField] = useState("created");
  const employees = [...new Map(tasks.map(task => [task.assigneeId, task.assignee])).entries()];
  const departments = [...new Map(tasks.map(task => [task.departmentId, task.department])).entries()];
  const invalid = Boolean(from && to && from > to);
  const filtered = tasks.filter(task => {
    const day = dateField === "due" ? task.dueDate : creationDay.format(new Date(task.createdAt));
    return !invalid && (!from && !to || Boolean(day && (!from || day >= from) && (!to || day <= to)))
      && (!employee || task.assigneeId === employee) && (!department || task.departmentId === department)
      && (!status || task.status === status) && (!priority || task.priority === priority);
  });
  function rows(performance: boolean): string[][] {
    if (!performance) return [["Task","Assignee","Status","Priority","Start date","Adjusted end date","Working days"],...filtered.map(task=>[task.title,task.assignee,task.status.replaceAll("_"," "),task.priority,task.startDate,task.deadline,String(task.workingDays ?? "")])];
    const people = new Map<string,{name:string; total:number; completed:number; pending:number}>();
    for (const task of filtered) { const person = people.get(task.assigneeId) || {name:task.assignee,total:0,completed:0,pending:0}; person.total++; if(closed(task.status))person.completed++;else if(!["CANCELLED","REJECTED"].includes(task.status))person.pending++;people.set(task.assigneeId,person); }
    return [["Employee","Assigned","Completed","Pending","Completion rate"],...[...people.values()].map(person=>[person.name,String(person.total),String(person.completed),String(person.pending),`${Math.round(person.completed/person.total*100)}%`])];
  }
  function excel(performance: boolean) {
    const csv = rows(performance).map(row=>row.map(value=>`"${(/^[=+@\-\t\r]/.test(value) ? `'${value}` : value).replaceAll('"','""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));
    const link = document.createElement("a");link.href=url;link.download=performance?"employee-performance.csv":"company-tasks.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function pdf(performance: boolean) {
    const report = rows(performance);
    const frame = document.createElement("iframe");frame.title="Print report";frame.style.cssText="position:fixed;width:0;height:0;border:0;right:0;bottom:0";document.body.appendChild(frame);
    const documentToPrint = frame.contentDocument;
    if (!documentToPrint) { frame.remove(); return; }
    const title = performance ? "Employee Performance Report" : "Task Report";
    documentToPrint.open();documentToPrint.write(`<!doctype html><html><head><title>${title}</title><style>body{font:12px Arial,sans-serif;color:#203047;padding:24px}h1{font-size:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d9e0e8;padding:9px;text-align:left}th{background:#f3f5f9}@page{size:landscape;margin:12mm}</style></head><body><h1>ILAMED · ${title}</h1><p>${dateField === "due" ? "Adjusted due date" : "Creation date"} (India time): ${escapeHtml(from || "Any start date")} — ${escapeHtml(to || "Any end date")}</p><p>${escapeHtml([employees.find(([id]) => id === employee)?.[1], departments.find(([id]) => id === department)?.[1], status, priority].filter(Boolean).join(" / "))}</p><table><thead><tr>${report[0].map(cell=>`<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${report.slice(1).map(row=>`<tr>${row.map(cell=>`<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);documentToPrint.close();
    setTimeout(()=>{if(frame.contentWindow){frame.contentWindow.onafterprint=()=>frame.remove();frame.contentWindow.focus();frame.contentWindow.print();}},250);
  }
  return <div className="workspace-view">
    <WorkspacePageHeading kicker="ANALYTICS" title="Reports" description="Download Excel-compatible CSV or PDF versions of operational reports." />
    <section className="workspace-surface" aria-label="Report filters"><h2>Report filters</h2><p className="workspace-field-hint">Filters apply to both downloads. Additional analytics below show all-time totals.</p>
      <div className="my-3 flex flex-wrap items-end gap-3">
        <label className="workspace-field">Employee<select value={employee} onChange={event => setEmployee(event.target.value)}><option value="">All employees</option>{employees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="workspace-field">Department<select value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="workspace-field">Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{[...new Set(tasks.map(task => task.status))].sort().map(value => <option key={value} value={value}>{value.replaceAll("_", " ").toLowerCase()}</option>)}</select></label>
        <label className="workspace-field">Priority<select value={priority} onChange={event => setPriority(event.target.value)}><option value="">All priorities</option><option value="HIGH">High</option><option value="MEDIUM">Normal</option><option value="LOW">Low</option></select></label>
        <label className="workspace-field">Filter dates by<select value={dateField} onChange={event => setDateField(event.target.value)}><option value="created">Creation date</option><option value="due">Adjusted due date</option></select></label>
        <button type="button" className="secondary-button px-3 py-2" onClick={() => { setEmployee(""); setDepartment(""); setStatus(""); setPriority(""); setDateField("created"); setFrom(""); setTo(""); }}>Clear filters</button>
      </div><div className="workspace-report-dates"><label className="workspace-field">From<input type="date" value={from} max={to || undefined} aria-invalid={invalid} onChange={event=>setFrom(event.target.value)} /></label><label className="workspace-field">To<input type="date" value={to} min={from || undefined} aria-invalid={invalid} onChange={event=>setTo(event.target.value)} /></label></div><p role={invalid ? "alert" : "status"} className="workspace-field-hint">{invalid ? "The end date must be on or after the start date." : `${filtered.length} of ${tasks.length} tasks - Filtered by ${dateField === "due" ? "adjusted due date" : "creation date"} - India time`}</p></section>
    <section className="workspace-report-cards">{[false,true].map(performance=><article className="workspace-surface workspace-export-card" key={String(performance)}><span className="workspace-export-icon"><Download size={20}/></span><div><h2>{performance?"Performance Report":"Task Report"}</h2><p>{performance?"Employee task totals and completion rates.":"Every task with status, priority, assignee, start date, and end date."}</p><div className="workspace-export-actions"><button type="button" className="export-excel" disabled={invalid} onClick={()=>excel(performance)}><FileSpreadsheet size={15}/>Excel CSV</button><button type="button" className="export-pdf" disabled={invalid} onClick={()=>pdf(performance)}><FileText size={15}/>PDF</button></div></div></article>)}</section>
  </div>;
}
