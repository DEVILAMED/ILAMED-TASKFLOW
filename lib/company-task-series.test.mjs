import assert from "node:assert/strict";
import test from "node:test";
import { groupCompanyTaskSeries, companyTaskSnapshot } from "./company-task-series.ts";
import { summarizeEmployeeWork } from "./employee-dashboard.ts";

const daily = (day, status = "TODO", overrides = {}) => ({
  id: `daily-${day}`, recurrenceId: "repeat", recurrenceDate: `2026-11-${day}`,
  dueDate: `2026-11-${day}`, createdAt: `2026-11-${day}T00:00:00Z`, status,
  recurrence: { isActive: true, endDate: "2026-11-30" }, ...overrides,
});

test("a daily series is one task while independent tasks and separate schedules stay distinct", () => {
  const tasks = [daily("20"), daily("21"), daily("24"), daily("20", "TODO", { recurrenceId: "other" }),
    { id: "once", status: "TODO" }, { id: "another", status: "TODO" }];
  const groups = groupCompanyTaskSeries(tasks);
  assert.equal(groups.length, 4);
  assert.equal(groups[0].occurrences.length, 3);
  assert.equal(companyTaskSnapshot(tasks).length, 4);
});

test("the oldest unresolved work is available without losing independent daily history", () => {
  const tasks = [daily("24"), daily("20", "APPROVED"), daily("21", "SUBMITTED_FOR_REVIEW")];
  const group = groupCompanyTaskSeries(tasks)[0];
  assert.equal(group.task.id, "daily-21");
  assert.deepEqual(group.occurrences.map(task => task.id), ["daily-20", "daily-21", "daily-24"]);
  assert.equal(group.occurrences[0].status, "APPROVED");
  assert.equal(tasks[0].id, "daily-24", "grouping must not reorder the input");
});

test("task lists prefer today's work while totals still account for older unfinished days", () => {
  const tasks = [daily("20", "SUBMITTED_FOR_REVIEW"), daily("21", "REVISION_REQUESTED"), daily("24", "TODO")];
  const group = groupCompanyTaskSeries(tasks, "2026-11-24")[0];
  assert.equal(group.task.id, "daily-24");
  assert.equal(group.occurrences.length, 3);
  const summary = summarizeEmployeeWork(tasks, "2026-11-24");
  assert.equal(summary.assigned, 1);
  assert.equal(summary.awaiting, 1);
  assert.equal(summary.completed, 0);
});

test("today remains the displayed day after submission or approval; absent days fall back to unfinished work", () => {
  for (const status of ["SUBMITTED_FOR_REVIEW", "APPROVED"]) {
    assert.equal(groupCompanyTaskSeries([daily("21"), daily("24", status)], "2026-11-24")[0].task.id, "daily-24");
  }
  assert.equal(groupCompanyTaskSeries([daily("20", "APPROVED"), daily("21")], "2026-11-22")[0].task.id, "daily-21");
  const rows = [daily("21"), daily("24")].map(task => ({ ...task, recurrenceDate: new Date(task.recurrenceDate) }));
  assert.equal(groupCompanyTaskSeries(rows, "2026-11-24")[0].task.id, "daily-24");
});

test("new daily work does not increase assigned totals or tasks created today", () => {
  const tasks = [daily("20", "APPROVED"), daily("21", "APPROVED"), daily("24", "TODO")];
  const snapshot = companyTaskSnapshot(tasks, "2026-11-24");
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].createdAt, "2026-11-20T00:00:00Z");
  const summary = summarizeEmployeeWork(tasks, "2026-11-24");
  assert.equal(summary.assigned, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.completed, 0);
});

test("approved daily work keeps a continuing series open without making it overdue", () => {
  const tasks = [daily("20", "APPROVED"), daily("21", "APPROVED")];
  const summary = summarizeEmployeeWork(tasks, "2026-11-24");
  assert.equal(summary.assigned, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.completed, 0);
  assert.equal(summary.overdue, 0);
  assert.equal(tasks[1].status, "APPROVED", "daily approval must remain unchanged");
  assert.equal(groupCompanyTaskSeries(tasks)[0].task.status, "APPROVED", "actions must target the actual daily status");
});

test("a finished or stopped series counts as completed only when all daily work is approved", () => {
  const done = [daily("20", "APPROVED"), daily("21", "DONE")];
  assert.equal(summarizeEmployeeWork(done, "2026-12-01").completed, 1);
  const stopped = done.map(task => ({ ...task, recurrence: { isActive: false, endDate: null } }));
  assert.equal(summarizeEmployeeWork(stopped, "2026-11-24").completed, 1);
  assert.equal(summarizeEmployeeWork([...stopped, daily("24", "REVISION_REQUESTED")], "2026-12-01").completed, 0);
  assert.equal(summarizeEmployeeWork([daily("20", "REJECTED"), daily("21", "APPROVED")], "2026-12-01").completed, 0);
});

test("Date objects from Prisma and serialized dates produce the same task groups", () => {
  const rows = [daily("20", "APPROVED"), daily("21")];
  const prisma = rows.map(task => ({ ...task, recurrenceDate: new Date(task.recurrenceDate), createdAt: new Date(task.createdAt), dueDate: new Date(task.dueDate) }));
  assert.equal(groupCompanyTaskSeries(prisma)[0].task.id, groupCompanyTaskSeries(rows)[0].task.id);
  assert.equal(companyTaskSnapshot(prisma)[0].createdAt.getTime(), Date.parse(rows[0].createdAt));
});
