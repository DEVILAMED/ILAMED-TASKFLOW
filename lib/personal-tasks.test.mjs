import assert from "node:assert/strict";
import test from "node:test";
import { filterPersonalTasks, personalSection, personalSummary } from "./personal-tasks.ts";

const today = "2026-11-14";
const base = { title: "Task", note: null, important: false, isCompleted: false, dueDate: null, myDayDate: null, reminderAt: null, repeat: null, listId: "inbox", list: { id: "inbox", name: "Inbox", ownerId: "owner" }, steps: [], createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" };
const tasks = [
  { ...base, id: "overdue", title: "Prepare slides", important: true, dueDate: "2026-11-12T00:00:00Z", myDayDate: "2026-11-14T00:00:00Z" },
  { ...base, id: "complete", title: "Read notes", isCompleted: true, important: true, dueDate: "2026-11-10T00:00:00Z", myDayDate: "2026-11-14T00:00:00Z" },
  { ...base, id: "today", title: "Book course", dueDate: "2026-11-14T00:00:00Z", listId: "learning", list: { id: "learning", name: "Learning", ownerId: "colleague" } },
  { ...base, id: "unscheduled", title: "Write outline", note: "Research anatomy", myDayDate: "2026-11-13T00:00:00Z" },
];
const ids = query => filterPersonalTasks(tasks, new URLSearchParams(query), today).map(task => task.id);

test("personal summary excludes completed work from open, important, My Day, and overdue totals", () => {
  assert.deepEqual(personalSummary(tasks, today), { total: 4, active: 3, completed: 1, important: 1, myDay: 1, overdue: 1, planned: 2 });
  assert.deepEqual(personalSummary([], today), { total: 0, active: 0, completed: 0, important: 0, myDay: 0, overdue: 0, planned: 0 });
});
test("personal views retain completed tasks and reset My Day at the date boundary", () => {
  assert.deepEqual(ids("section=my-day"), ["overdue", "complete"]);
  assert.deepEqual(ids("section=important&status=completed"), ["complete"]);
  assert.deepEqual(ids("section=tasks&due=overdue"), ["overdue"]);
  assert.deepEqual(ids("section=tasks&due=today"), ["today"]);
});
test("list, status, date, and search filters work together for accessible personal tasks", () => {
  assert.deepEqual(ids("section=tasks&list=learning&status=active&due=planned&q=COURSE"), ["today"]);
  assert.deepEqual(ids("q=anatomy&due=none&importance=normal"), ["unscheduled"]);
  assert.deepEqual(ids("q=learning"), ["today"]);
  assert.deepEqual(ids("list=inaccessible"), []);
});
test("task sorting leaves the source unchanged and does not mix missing dates with overdue tasks", () => {
  const original = tasks.map(task => task.id);
  assert.deepEqual(ids("sort=title"), ["today", "overdue", "complete", "unscheduled"]);
  assert.deepEqual(ids("section=tasks"), ["overdue", "today", "unscheduled", "complete"]);
  assert.deepEqual(tasks.map(task => task.id), original);
  assert.equal(personalSection("invalid"), "dashboard");
  assert.equal(personalSection("calendar"), "calendar");
});
