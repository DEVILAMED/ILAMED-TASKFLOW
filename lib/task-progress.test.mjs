import assert from "node:assert/strict";
import test from "node:test";
import { getChecklistProgress } from "./task-progress.ts";

test("checklist progress is the percentage of completed items", () => {
  const items = [true, false, true, false, true].map((isCompleted) => ({ isCompleted }));
  assert.deepEqual(getChecklistProgress(items), { completed: 3, total: 5, percentage: 60 });
  assert.deepEqual(getChecklistProgress([{ isCompleted: true }, { isCompleted: false }]), { completed: 1, total: 2, percentage: 50 });
});

test("empty, untouched, and completed checklists have valid boundaries", () => {
  assert.deepEqual(getChecklistProgress(), { completed: 0, total: 0, percentage: 0 });
  assert.deepEqual(getChecklistProgress([{ isCompleted: false }]), { completed: 0, total: 1, percentage: 0 });
  assert.deepEqual(getChecklistProgress([{ isCompleted: true }, { isCompleted: true }]), { completed: 2, total: 2, percentage: 100 });
});

test("rounding and checking or unchecking an item recalculate the percentage", () => {
  const items = [{ isCompleted: true }, { isCompleted: false }, { isCompleted: false }];
  assert.equal(getChecklistProgress(items).percentage, 33);
  items[1].isCompleted = true;
  assert.equal(getChecklistProgress(items).percentage, 67);
  items[0].isCompleted = false;
  assert.equal(getChecklistProgress(items).percentage, 33);
});

test("calculating progress does not modify the task's checklist", () => {
  const items = Object.freeze([Object.freeze({ isCompleted: true }), Object.freeze({ isCompleted: false })]);
  assert.equal(getChecklistProgress(items).percentage, 50);
  assert.deepEqual(items, [{ isCompleted: true }, { isCompleted: false }]);
});
