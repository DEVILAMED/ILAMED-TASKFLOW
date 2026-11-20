import { REVIEW_RUBRIC } from "./review-quality.ts";

export type ReportReview = { id: string; decision: string; rating: number | null; feedback: string; createdAt: string; reviewer: string };
export type ReportSubmission = { submittedById: string; submittedBy: string; createdAt: string; notes: string | null; files: string[]; reviews: ReportReview[] };
export type ReportTask = {
  id: string; title: string; description: string | null;
  assignee: string; assigneeId: string; email: string; designation: string; employeeCode: string;
  departmentId: string; department: string; dueDate: string | null; originalDueDate: string | null;
  status: string; priority: string; startDate: string; deadline: string; workingDays: number | null;
  createdAt: string; source: string; assignedBy: string; overdue: boolean; recurrenceDate: string | null;
  checklist: { title: string; isCompleted: boolean }[]; submissions: ReportSubmission[];
  history: { fromStatus: string | null; toStatus: string; createdAt: string; actor: string }[];
  comments: { content: string; createdAt: string; author: string }[];
};
export type ReportFilters = { from: string; to: string; employee: string; department: string; status: string; priority: string; dateField: string };
const terminal = ["APPROVED", "DONE", "CANCELLED", "REJECTED"];
const complete = (task: ReportTask) => ["APPROVED", "DONE"].includes(task.status);
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
export const reportDay = (value: string) => dayFormat.format(new Date(value));
export const reportDateTime = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const label = (value: string) => value.replaceAll("_", " ").toLowerCase();
export const escapeReportHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function filterReportTasks(tasks: ReportTask[], filters: ReportFilters) {
  const { from, to, employee, department, status, priority, dateField } = filters;
  if (from && to && from > to) return [];
  const includes = (day: string | null) => !!day && (!from || day >= from) && (!to || day <= to);
  return tasks.filter(task => {
    const dates = dateField === "due" ? [task.dueDate]
      : dateField === "submitted" ? task.submissions.map(item => reportDay(item.createdAt))
      : dateField === "reviewed" ? task.submissions.flatMap(item => item.reviews.map(review => reportDay(review.createdAt)))
      : [reportDay(task.createdAt)];
    return (!from && !to || dates.some(includes)) && (!employee || task.assigneeId === employee)
      && (!department || task.departmentId === department) && (!status || task.status === status) && (!priority || task.priority === priority);
  });
}

export function summarizeReportTasks(tasks: ReportTask[]) {
  // Attribute ratings to the person who submitted the work, even after reassignment.
  const rated = tasks.flatMap(task => {
    const reviews = task.submissions.filter(item => item.submittedById === task.assigneeId).flatMap(item => item.reviews)
      .filter(review => review.rating !== null && review.rating >= 1 && review.rating <= 5)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return reviews[0] ? [reviews[0].rating!] : [];
  });
  const completed = tasks.filter(complete).length;
  return {
    total: tasks.length, completed, pending: tasks.filter(task => !terminal.includes(task.status)).length,
    overdue: tasks.filter(task => task.overdue).length,
    awaiting: tasks.filter(task => task.status === "SUBMITTED_FOR_REVIEW").length,
    cancelled: tasks.filter(task => task.status === "CANCELLED").length,
    rejected: tasks.filter(task => task.status === "REJECTED").length,
    completionRate: tasks.length ? Math.round(completed / tasks.length * 100) : 0,
    rated: rated.length, averageRating: rated.length ? (rated.reduce((sum, value) => sum + value, 0) / rated.length).toFixed(2) : "Not rated",
    revisions: tasks.reduce((sum, task) => sum + task.submissions.filter(item => item.submittedById === task.assigneeId).reduce((count, item) => count + item.reviews.filter(review => review.decision === "REVISION_REQUESTED").length, 0), 0),
  };
}

export function performanceReportRows(tasks: ReportTask[]): string[][] {
  return [["Employee", "Email", "Employee code", "Designation", "Department", "Task ID", "Task", "Description", "Source", "Assigned by", "Created (India time)", "Daily work date", "Status", "Priority", "Start date", "Original deadline", "Adjusted deadline", "Working days", "Overdue", "Checklist", "Completion / approval history (India time)", "Submission and review evidence (India time)", "Progress updates (India time)"],
    ...tasks.map(task => [task.assignee, task.email, task.employeeCode, task.designation, task.department, task.id, task.title, task.description ?? "", task.source, task.assignedBy, reportDateTime(task.createdAt), task.recurrenceDate ?? "", label(task.status), label(task.priority), task.startDate, task.originalDueDate ?? "", task.deadline, String(task.workingDays ?? ""), task.overdue ? "Yes" : "No",
      task.checklist.map(item => `${item.isCompleted ? "[Done]" : "[Pending]"} ${item.title}`).join("\n"),
      task.history.map(item => `${reportDateTime(item.createdAt)} | ${item.actor} | ${item.fromStatus ? label(item.fromStatus) : "Created"} -> ${label(item.toStatus)}`).join("\n"),
      task.submissions.map(item => `${reportDateTime(item.createdAt)} | Submitted by ${item.submittedBy}\n${item.notes ?? "No submission notes"}${item.files.length ? `\nFiles: ${item.files.join(", ")}` : ""}\n${item.reviews.map(review => `${reportDateTime(review.createdAt)} | ${review.reviewer} | ${label(review.decision)} | Rating: ${review.rating ?? "Not rated"}${review.rating !== null ? "/5" : ""}\n${review.feedback}`).join("\n") || "Awaiting review"}`).join("\n\n"),
      task.comments.map(item => `${reportDateTime(item.createdAt)} | ${item.author}\n${item.content}`).join("\n\n"),
    ])];
}

export function reportCsv(rows: string[][]) {
  return "\ufeff" + rows.map(row => row.map(value => `"${(/^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
}

export function performanceReportHtml(tasks: ReportTask[], filters: ReportFilters, generatedAt = new Date()) {
  const e = escapeReportHtml;
  const text = (value: string | null) => `<p class="prose">${e(value || "Not recorded")}</p>`;
  const groups = new Map<string, ReportTask[]>();
  for (const task of tasks) groups.set(task.assigneeId, [...(groups.get(task.assigneeId) ?? []), task]);
  const dateLabels: Record<string, string> = { created: "Task creation date", due: "Adjusted due date", submitted: "Submission date", reviewed: "Review date" };
  const body = [...groups.values()].map(employeeTasks => {
    const person = employeeTasks[0];
    const summary = summarizeReportTasks(employeeTasks);
    const metrics = [["Task entries", summary.total], ["Completed", summary.completed], ["Pending", summary.pending], ["Overdue now", summary.overdue], ["Awaiting review", summary.awaiting], ["Cancelled", summary.cancelled], ["Rejected", summary.rejected], ["Completion rate", `${summary.completionRate}%`], ["Latest rating average", summary.averageRating === "Not rated" ? summary.averageRating : `${summary.averageRating}/5`], ["Rated entries", summary.rated], ["Revisions requested", summary.revisions]];
    return `<section class="employee"><header class="employee-heading"><h2>${e(person.assignee)}</h2><p>${e(person.email)} · ${e(person.employeeCode || "No employee code")} · ${e(person.designation || "No designation")}</p><p>${e(person.department)}</p></header>
      <div class="metrics">${metrics.map(([name, value]) => `<div><strong>${e(value)}</strong><span>${e(name)}</span></div>`).join("")}</div>
      <h3>Task evidence</h3>${employeeTasks.map((task, index) => `<article class="task"><div class="task-heading"><h4>${index + 1}. ${e(task.title)}</h4><span>${e(label(task.status))} · ${e(label(task.priority))} priority</span></div>
        <p class="muted">Task ID: ${e(task.id)}${task.recurrenceDate ? ` · Daily work date: ${e(task.recurrenceDate)}` : ""}</p>
        <table><tbody><tr><th>Source / assigned by</th><td>${e(task.source)} / ${e(task.assignedBy)}</td><th>Created</th><td>${e(reportDateTime(task.createdAt))}</td></tr><tr><th>Start date</th><td>${e(task.startDate)}</td><th>Original deadline</th><td>${e(task.originalDueDate || "Not set")}</td></tr><tr><th>Adjusted deadline</th><td>${e(task.deadline)}</td><th>Working days / overdue now</th><td>${e(task.workingDays ?? "Not set")} / ${task.overdue ? "Yes" : "No"}</td></tr></tbody></table>
        <h5>Description / deliverables</h5>${text(task.description)}
        <h5>Checklist (${task.checklist.filter(item => item.isCompleted).length}/${task.checklist.length})</h5>${task.checklist.length ? `<ul>${task.checklist.map(item => `<li>${item.isCompleted ? "[Done]" : "[Pending]"} ${e(item.title)}</li>`).join("")}</ul>` : "<p>No checklist recorded.</p>"}
        <h5>Status and completion history</h5>${task.history.length ? `<ul>${task.history.map(item => `<li>${e(reportDateTime(item.createdAt))} · ${e(item.actor)} · ${e(item.fromStatus ? label(item.fromStatus) : "Created")} → ${e(label(item.toStatus))}</li>`).join("")}</ul>` : "<p>No status history recorded.</p>"}
        <h5>Submissions and reviews</h5>${task.submissions.length ? task.submissions.map((item, submissionIndex) => `<div class="evidence"><h6>Submission ${submissionIndex + 1} · ${e(reportDateTime(item.createdAt))} · ${e(item.submittedBy)}</h6>${text(item.notes)}${item.files.length ? `<p>Files: ${e(item.files.join(", "))}</p>` : ""}${item.reviews.map(review => `<div class="review"><p><strong>${e(label(review.decision))}</strong> · ${e(review.reviewer)} · ${e(reportDateTime(review.createdAt))} · Rating: ${e(review.rating ?? "Not rated")}${review.rating !== null ? "/5" : ""}</p>${text(review.feedback)}</div>`).join("") || "<p>Awaiting review.</p>"}</div>`).join("") : "<p>No submissions recorded.</p>"}
        <h5>Progress updates and blockers</h5>${task.comments.map(item => `<div class="evidence"><p class="muted">${e(reportDateTime(item.createdAt))} · ${e(item.author)}</p>${text(item.content)}</div>`).join("") || "<p>No updates recorded.</p>"}
      </article>`).join("")}</section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Employee Performance Report</title><style>
    @page{size:A4 portrait;margin:16mm}*{box-sizing:border-box}body{font:11px/1.55 Arial,sans-serif;color:#203047;margin:0}h1{font-size:25px;margin:0 0 6px}h2{font-size:21px;margin:0}h3{font-size:16px;margin:22px 0 10px}h4{font-size:15px;margin:0}h5{font-size:12px;margin:17px 0 5px}h6{font-size:11px;margin:0}p{margin:5px 0}header,p,li,td,th{overflow-wrap:anywhere}.cover{border-bottom:3px solid #2443b3;padding-bottom:16px;margin-bottom:22px}.muted,.notes{color:#526176}.notes{font-size:10px}.employee+.employee{break-before:page}.employee-heading{border-bottom:1px solid #d9e0e8;padding-bottom:12px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.metrics div{border:1px solid #d9e0e8;padding:9px}.metrics strong{display:block;font-size:17px}.metrics span{font-size:10px}.task{border-top:2px solid #2443b3;padding-top:12px;margin-top:24px}.task-heading{break-inside:avoid}.task-heading span{text-transform:capitalize;color:#526176}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:10px}th,td{border:1px solid #d9e0e8;padding:7px;text-align:left;vertical-align:top}th{background:#f3f5f9;width:18%}thead{display:table-header-group}tr,.metrics,.employee-heading{break-inside:avoid}h3,h4,h5,h6{break-after:avoid}.prose{white-space:pre-wrap;overflow-wrap:anywhere}.evidence{border-left:2px solid #d9e0e8;padding:5px 10px;margin:8px 0}.review{margin-top:8px;padding-top:6px;border-top:1px solid #d9e0e8}ul{padding-left:20px}footer{border-top:1px solid #d9e0e8;margin-top:24px;padding-top:10px;font-size:10px;color:#526176}
    </style></head><body><header class="cover"><p>ILAMED · EMPLOYEE REVIEW</p><h1>Employee Performance Report</h1><p>${e(dateLabels[filters.dateField] || "Task creation date")}: ${e(filters.from || "All dates")} to ${e(filters.to || "All dates")}</p><p>Generated ${e(reportDateTime(generatedAt.toISOString()))} (India time)</p><p>Employee: ${e(filters.employee ? tasks[0]?.assignee || "No matching employee tasks" : "All accessible employees")} · Department: ${e(filters.department ? tasks[0]?.department || "No matching department tasks" : "All accessible departments")}</p><p>Status: ${e(filters.status ? label(filters.status) : "All")} · Priority: ${e(filters.priority ? label(filters.priority) : "All")}</p></header>
    <p class="notes">Scope: tasks matching the selected filters, including each daily task occurrence. Task status, checklist and overdue figures are current at generation time. All timestamps use Asia/Kolkata. Each selected task includes its complete recorded submission and review history, including events outside the selected dates. Completion rate = approved or legacy completed entries / all selected entries. Rating average uses the latest recorded numeric rating per task occurrence submitted by the current assignee; unrated entries are excluded. This is supporting evidence, not the dashboard quality score. Deadlines account for recorded Sundays and leave. Attachment filenames are included; file contents are not embedded.</p>
    <p class="notes">Rating guide: ${REVIEW_RUBRIC.map(item => `${item.rating}/5 — ${e(item.label)}`).join("; ")}. Assignment source reflects the recorded assigner; original creation attribution may be unavailable after reassignment.</p>
    ${body || "<p>No tasks match the selected filters.</p>"}<footer>End of report · ${tasks.length} task entries · Generated from recorded task evidence.</footer></body></html>`;
}
