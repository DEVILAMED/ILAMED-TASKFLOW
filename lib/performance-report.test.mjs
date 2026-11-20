import assert from "node:assert/strict";
import test from "node:test";
import { filterReportTasks, performanceReportHtml, performanceReportRows, reportCsv, summarizeReportTasks } from "./performance-report.ts";

const filters = { from: "", to: "", employee: "", department: "", status: "", priority: "", dateField: "created" };
const review = (overrides = {}) => ({ id: "review-1", decision: "REVISION_REQUESTED", rating: 2, feedback: "Add supporting calculations", reviewer: "Manager", createdAt: "2026-11-20T10:00:00Z", ...overrides });
const submission = (overrides = {}) => ({ submittedById: "employee-1", submittedBy: "Employee One", notes: "Completed the analysis", createdAt: "2026-11-19T10:00:00Z", files: ["analysis.pdf"], reviews: [review()], ...overrides });
const task = (overrides = {}) => ({
  id: "task-1", title: "Analysis", description: "Analyse monthly results", assignee: "Employee One", assigneeId: "employee-1", email: "one@example.com", employeeCode: "E001", designation: "Analyst", departmentId: "dept-1", department: "Operations",
  dueDate: "2026-11-21", originalDueDate: "2026-11-20", startDate: "19 Nov 2026", deadline: "21 Nov 2026", workingDays: 2, createdAt: "2026-11-18T20:00:00Z", recurrenceDate: null,
  source: "Admin-assigned", assignedBy: "Admin", status: "IN_PROGRESS", priority: "HIGH", overdue: false,
  checklist: [{ title: "Verify totals", isCompleted: true }, { title: "Add calculations", isCompleted: false }],
  history: [{ fromStatus: null, toStatus: "TODO", createdAt: "2026-11-18T20:00:00Z", actor: "Admin" }],
  comments: [{ content: "Waiting for updated figures", createdAt: "2026-11-19T12:00:00Z", author: "Employee One" }], submissions: [submission()], ...overrides,
});

test("report filters combine employee, department, status, priority, and inclusive India calendar dates", () => {
  const tasks = [task(), task({ id: "other", assigneeId: "employee-2" })];
  const selection = { ...filters, employee: "employee-1", department: "dept-1", status: "IN_PROGRESS", priority: "HIGH", from: "2026-11-19", to: "2026-11-19" };
  assert.deepEqual(filterReportTasks(tasks, selection).map(task => task.id), ["task-1"]);
  assert.equal(filterReportTasks(tasks, { ...selection, from: "2026-11-20" }).length, 0);
  assert.equal(filterReportTasks(tasks, { ...selection, priority: "LOW" }).length, 0);
  assert.equal(filterReportTasks(tasks, { ...selection, dateField: "due", from: "2026-11-21", to: "2026-11-21" }).length, 1);
});

test("submission and review date filters use their own timestamps and include midnight boundaries", () => {
  const tasks = [task({ submissions: [submission({ createdAt: "2026-11-19T18:30:00Z", reviews: [review({ createdAt: "2026-11-20T18:30:00Z" })] })] })];
  assert.equal(filterReportTasks(tasks, { ...filters, dateField: "submitted", from: "2026-11-20", to: "2026-11-20" }).length, 1);
  assert.equal(filterReportTasks(tasks, { ...filters, dateField: "reviewed", from: "2026-11-20", to: "2026-11-20" }).length, 0);
  assert.equal(filterReportTasks(tasks, { ...filters, dateField: "reviewed", from: "2026-11-21", to: "2026-11-21" }).length, 1);
  assert.equal(filterReportTasks([task({ submissions: [] })], { ...filters, dateField: "reviewed", from: "2026-11-01" }).length, 0);
});

test("daily occurrences retain their separate evidence and task IDs", () => {
  const tasks = [task({ id: "daily-1", recurrenceDate: "2026-11-19" }), task({ id: "daily-2", recurrenceDate: "2026-11-20", source: "Self-created" })];
  const selected = filterReportTasks(tasks, filters);
  assert.equal(selected.length, 2);
  const rows = performanceReportRows(selected);
  assert.equal(rows.length, 3);
  assert.match(performanceReportHtml(selected, filters), /daily-1/);
  assert.match(performanceReportHtml(selected, filters), /daily-2/);
  assert.match(performanceReportHtml(selected, filters), /Self-created/);
});

test("summary counts use current status and latest rated submission per occurrence without crediting previous assignees", () => {
  const tasks = [task({ status: "APPROVED", submissions: [submission(), submission({ reviews: [review({ id: "review-2", createdAt: "2026-11-21T10:00:00Z", decision: "APPROVED", rating: 4 })] })] }), task({ id: "task-2", overdue: true, submissions: [submission({ submittedById: "previous-assignee", reviews: [review({ rating: 5 })] })] }), task({ id: "task-3", status: "CANCELLED", submissions: [] }), task({ id: "task-4", status: "REJECTED", submissions: [] }), task({ id: "task-5", status: "SUBMITTED_FOR_REVIEW", submissions: [] })];
  const result = summarizeReportTasks(tasks);
  assert.deepEqual(result, { total: 5, completed: 1, pending: 2, overdue: 1, awaiting: 1, cancelled: 1, rejected: 1, completionRate: 20, rated: 1, averageRating: "4.00", revisions: 1 });
  assert.equal(summarizeReportTasks([]).averageRating, "Not rated");
});

test("PDF contains employee identity, scope, dates, complete evidence, feedback, and methodology without requiring app access", () => {
  const html = performanceReportHtml([task()], { ...filters, employee: "employee-1", from: "2026-11-19", to: "2026-11-20", dateField: "reviewed" }, new Date("2026-11-21T10:00:00Z"));
  for (const value of ["Employee One", "one@example.com", "E001", "Analyst", "Operations", "Review date", "2026-11-19", "2026-11-20", "Analyse monthly results", "Admin-assigned", "Verify totals", "Add calculations", "Completed the analysis", "analysis.pdf", "Add supporting calculations", "Waiting for updated figures", "Latest rating average", "outside the selected dates", "file contents are not embedded", "Asia/Kolkata"]) assert.ok(html.includes(value), value);
  assert.ok(html.includes("@page{size:A4 portrait"));
  assert.equal(html.includes("/api/"), false);
});

test("untrusted employee, task, comment, file, and review content is escaped in printable HTML", () => {
  const injection = '<script>alert("test")</script>';
  const html = performanceReportHtml([task({ title: injection, assignee: injection, description: injection, comments: [{ content: injection, author: injection, createdAt: "2026-11-19T10:00:00Z" }], submissions: [submission({ files: [injection], reviews: [review({ feedback: injection })] })] })], filters);
  assert.equal(html.includes("<script>"), false);
  assert.ok(html.includes("&lt;script&gt;"));
});

test("CSV preserves multiline evidence and escapes quotes and spreadsheet formulas", () => {
  const rows = performanceReportRows([task({ title: '=HYPERLINK("bad")', description: 'First line\n"Second"' })]);
  const csv = reportCsv(rows);
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"bad\"\")\""));
  assert.ok(csv.includes('First line\n""Second""'));
  assert.ok(csv.includes("Add supporting calculations"));
  assert.ok(csv.includes("Waiting for updated figures"));
  assert.ok(reportCsv([["  =1+1"]]).includes("'  =1+1"));
});

test("empty reports explicitly state no matching evidence and do not invent ratings", () => {
  const html = performanceReportHtml([], filters);
  assert.match(html, /No tasks match the selected filters/);
  assert.match(html, /0 task entries/);
  assert.equal(performanceReportRows([]).length, 1);
});
