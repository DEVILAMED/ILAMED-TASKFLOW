import assert from "node:assert/strict";
import test from "node:test";
import { summarizeEmployeeWork, employeeDayKey } from "./employee-dashboard.ts";

test("approved tasks remain visible in personal totals and do not count as overdue", () => {
  const result=summarizeEmployeeWork([{status:"APPROVED",dueDate:"2026-11-10"},{status:"DONE",dueDate:"2026-11-11"},{status:"IN_PROGRESS",dueDate:"2026-11-12"},{status:"SUBMITTED_FOR_REVIEW",dueDate:"2026-11-20"}],[],"2026-11-14");
  assert.equal(result.assigned,4);assert.equal(result.completed,2);assert.equal(result.pending,2);assert.equal(result.overdue,1);assert.equal(result.awaiting,1);assert.equal(result.completionRate,50);
});

test("review scores use actual rated feedback and ignore unrated reviews", () => {
  assert.equal(summarizeEmployeeWork([],[{rating:4},{rating:3},{rating:null}],"2026-11-14").reviewScore,70);
  assert.equal(summarizeEmployeeWork([],[{rating:null}],"2026-11-14").reviewScore,null);
});

test("an employee with no assigned work has no fabricated completion or review score", () => {
  const result=summarizeEmployeeWork([],[],"2026-11-14");
  assert.equal(result.assigned,0);assert.equal(result.completed,0);assert.equal(result.completionRate,null);assert.equal(result.reviewScore,null);
});

test("cancelled and rejected work is closed without counting as completed", () => {
  const result=summarizeEmployeeWork([{status:"CANCELLED",dueDate:"2026-11-10"},{status:"REJECTED",dueDate:"2026-11-10"}],[],"2026-11-14");
  assert.equal(result.completed,0);assert.equal(result.pending,0);assert.equal(result.overdue,0);
});

test("the personal dashboard uses the employee's India date at midnight boundaries", () => {
  assert.equal(employeeDayKey(new Date("2026-11-13T20:00:00Z")),"2026-11-14");
});
