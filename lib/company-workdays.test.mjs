import assert from "node:assert/strict";
import test from "node:test";
import { companyScheduleOverlaps, companyTaskSchedule, countCompanyWorkdays, isCompanyTaskOverdue } from "./company-workdays.ts";

test("working days count Saturday and skip Sunday and unique employee leave dates", () => {
  const leave = ["2026-11-21", "2026-11-21", "2026-11-22", "2026-11-24"];
  assert.equal(countCompanyWorkdays("2026-11-21", "2026-11-23"), 2);
  assert.equal(countCompanyWorkdays("2026-11-21", "2026-11-23", leave), 1);
  assert.equal(countCompanyWorkdays("2026-11-22", "2026-11-22"), 0);
  assert.equal(countCompanyWorkdays("1969-12-27", "1970-01-02"), 6);
});

test("a leave day inside the schedule is replaced after the deadline, skipping Sunday and further leave", () => {
  const task = { startDate: "2026-11-19", dueDate: "2026-11-21" };
  const leave = ["2026-11-20", "2026-11-23"];
  const schedule = companyTaskSchedule(task, leave);
  assert.deepEqual(schedule, { startDate: "2026-11-19", dueDate: "2026-11-24", workingDays: 3 });
  assert.equal(companyScheduleOverlaps(schedule, "2026-11-22", "2026-11-23", leave), false);
  assert.equal(companyScheduleOverlaps(schedule, "2026-11-23", "2026-11-24", leave), true);
  assert.equal(companyTaskSchedule(task).dueDate, "2026-11-21");
});

test("a legacy deadline on Sunday rolls to the next available working day", () => {
  const schedule = companyTaskSchedule({ dueDate: "2026-11-22" }, ["2026-11-23"]);
  assert.deepEqual(schedule, { startDate: "2026-11-24", dueDate: "2026-11-24", workingDays: 1 });
  assert.equal(companyTaskSchedule({ dueDate: null }).workingDays, null);
});

test("the first overdue day respects the employee's calendar and existing overdue work stays visible", () => {
  const task = { status: "IN_PROGRESS", startDate: "2026-11-20", dueDate: "2026-11-21", assigneeId: "alex" };
  const leave = { alex: ["2026-11-23", "2026-11-25"] };
  assert.equal(isCompanyTaskOverdue(task, "2026-11-22", leave), false);
  assert.equal(isCompanyTaskOverdue(task, "2026-11-23", leave), false);
  assert.equal(isCompanyTaskOverdue(task, "2026-11-24", leave), true);
  assert.equal(isCompanyTaskOverdue(task, "2026-11-25", leave), true);
  assert.equal(isCompanyTaskOverdue({ ...task, assigneeId: "beth" }, "2026-11-23", leave), true);
  assert.equal(isCompanyTaskOverdue({ ...task, status: "APPROVED" }, "2026-11-24", leave), false);
});
