import assert from "node:assert/strict";
import test from "node:test";
import { formatTaskDateRange, taskDateKey, taskIsScheduledOn, taskOverlapsDateRange } from "./task-dates.ts";

test("calendar date keys accept serialized and database dates without shifting the day", () => {
  for (const value of ["2026-11-17", "2026-11-17T00:00:00.000Z", new Date("2026-11-17T00:00:00.000Z")]) {
    assert.equal(taskDateKey(value), "2026-11-17");
  }
  for (const value of [null, undefined, "", "2026-02-29", "invalid", new Date(NaN)]) assert.equal(taskDateKey(value), null);
});

test("tasks appear on every date in their inclusive range", () => {
  const task = { startDate: "2026-11-17", dueDate: "2026-11-20" };
  for (const day of ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]) assert.equal(taskIsScheduledOn(task, day), true);
  for (const day of ["2026-11-16", "2026-11-21"]) assert.equal(taskIsScheduledOn(task, day), false);
});

test("same-day, leap-day, and year-crossing schedules include their boundaries", () => {
  assert.equal(taskIsScheduledOn({ startDate: "2026-11-17", dueDate: "2026-11-17" }, "2026-11-17"), true);
  assert.equal(taskIsScheduledOn({ startDate: "2024-02-28", dueDate: "2024-03-01" }, "2024-02-29"), true);
  const yearRange = { startDate: "2026-12-30", dueDate: "2027-01-02" };
  for (const day of ["2026-12-31", "2027-01-01", "2027-01-02"]) assert.equal(taskIsScheduledOn(yearRange, day), true);
});

test("month agendas include ranges that overlap or span the entire month", () => {
  const task = { startDate: "2026-11-30", dueDate: "2026-12-02" };
  assert.equal(taskOverlapsDateRange(task, "2026-11-01", "2026-11-30"), true);
  assert.equal(taskOverlapsDateRange(task, "2026-12-01", "2026-12-31"), true);
  assert.equal(taskOverlapsDateRange(task, "2027-01-01", "2027-01-31"), false);
  assert.equal(taskOverlapsDateRange({ startDate: "2026-10-01", dueDate: "2027-01-01" }, "2026-11-01", "2026-11-30"), true);
});

test("legacy deadlines and personal to-dos keep their existing one-day calendar behavior", () => {
  const legacy = { dueDate: "2026-11-20T00:00:00.000Z" };
  assert.equal(taskIsScheduledOn(legacy, "2026-11-20"), true);
  assert.equal(taskIsScheduledOn(legacy, "2026-11-19"), false);
  assert.match(formatTaskDateRange(null, legacy.dueDate), /^Until /);
});

test("unscheduled and inverted ranges do not populate calendar days", () => {
  assert.equal(taskIsScheduledOn({ startDate: null, dueDate: null }, "2026-11-17"), false);
  assert.equal(taskIsScheduledOn({ startDate: "2026-11-20", dueDate: "2026-11-17" }, "2026-11-18"), false);
  assert.equal(formatTaskDateRange(null, null), "Not scheduled");
});

test("date range labels show both boundaries and support same-day work", () => {
  const label = formatTaskDateRange("2026-11-17", "2026-11-20");
  for (const part of ["Nov", "17", "20", "2026"]) assert.ok(label.includes(part));
  assert.equal(formatTaskDateRange("2026-11-17", "2026-11-17"), "Nov 17, 2026");
});
