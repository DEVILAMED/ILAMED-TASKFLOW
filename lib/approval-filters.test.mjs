import assert from "node:assert/strict";
import test from "node:test";
import { filterApprovals, readApprovalFilters } from "./approval-filters.ts";

const employee = { id: "alex", name: "Alex", email: "alex@example.com" };
const other = { id: "other", name: "Alex", email: "other@example.com" };
const item = (id, assignee, createdAt, dueDate, overrides = {}) => ({
  id, title: `Task ${id}`, description: "Inspect equipment", assignee, dueDate,
  submission: createdAt ? { createdAt, submitter: assignee?.name ?? "Employee", notes: "Checked the wiring" } : null,
  ...overrides,
});
const tasks = [
  item("one", employee, "2026-11-19T18:30:00Z", "2026-11-21T00:00:00Z"),
  item("two", other, "2026-11-20T18:29:59Z", "2026-11-20T00:00:00Z"),
  item("three", employee, "2026-11-20T18:30:00Z", null),
  item("four", null, null, null),
];
const filters = query => readApprovalFilters(new URLSearchParams(query));
const ids = (query, source = tasks) => filterApprovals(source, filters(query)).map(task => task.id);

test("the default queue keeps all submissions in API order without mutating data", () => {
  assert.deepEqual(ids(""), ["one", "two", "three", "four"]);
  const copy = tasks.slice();
  assert.deepEqual(ids("sort=newest"), ["three", "two", "one", "four"]);
  assert.deepEqual(ids("sort=oldest"), ["one", "two", "three", "four"]);
  assert.deepEqual(tasks, copy);
});

test("user filters use identity IDs even when users share the same name", () => {
  assert.deepEqual(ids("user=alex"), ["one", "three"]);
  assert.deepEqual(ids("user=other"), ["two"]);
  assert.deepEqual(ids("user=missing"), []);
});

test("submission dates include both full days in India time across UTC midnight boundaries", () => {
  assert.deepEqual(ids("from=2026-11-20&to=2026-11-20"), ["one", "two"]);
  assert.deepEqual(ids("from=2026-11-21"), ["three"]);
  assert.deepEqual(ids("to=2026-11-20"), ["one", "two"]);
  assert.deepEqual(ids("from=2026-11-21&to=2026-11-20"), []);
});

test("due date mode uses the task calendar date and excludes undated tasks only when a bound is applied", () => {
  assert.deepEqual(ids("date=due&from=2026-11-20&to=2026-11-20"), ["two"]);
  assert.deepEqual(ids("date=due&from=2026-11-21"), ["one"]);
  assert.deepEqual(ids("date=due"), ["one", "two", "three", "four"]);
});

test("search, user, selected submission and dates combine instead of overriding each other", () => {
  assert.deepEqual(ids("user=alex&from=2026-11-20&to=2026-11-20&q=WIRING"), ["one"]);
  assert.deepEqual(ids("q=other%40example.com"), ["two"]);
  assert.deepEqual(ids("q=%20%20inspect%20%20"), ["one", "two", "three", "four"]);
  assert.deepEqual(ids("task=three&user=other"), []);
  assert.deepEqual(ids("task=one&user=alex&from=2026-11-20"), ["one"]);
  assert.deepEqual(ids("q=absent"), []);
});

test("malformed URL dates and unsupported sort or date modes fall back to defaults", () => {
  assert.deepEqual(filters("from=2026-02-30&to=invalid&date=unknown&sort=unknown"), filters(""));
  assert.equal(filters("from=2026-11-20T00:00:00Z").from, "");
});

test("missing or invalid submission timestamps do not match date ranges or break sorting", () => {
  const source = [tasks[0], item("invalid", employee, "invalid", null), tasks[3]];
  assert.deepEqual(ids("from=2026-11-20", source), ["one"]);
  assert.deepEqual(ids("sort=newest", source), ["one", "invalid", "four"]);
});
