import assert from "node:assert/strict";
import test from "node:test";
import { companyTaskHref } from "./company-task-links.ts";

test("task links open the appropriate role-specific task context", () => {
  assert.equal(companyTaskHref("ADMIN", "admin", "task-1", "employee"), "/admin?task=task-1");
  assert.equal(companyTaskHref("USER", "employee", "task-1", "employee"), "/company-tasks?task=task-1");
  assert.equal(companyTaskHref("MANAGER", "manager", "task-1", "manager"), "/company-tasks?task=task-1");
  assert.equal(companyTaskHref("MANAGER", "manager", "task-1", "employee"), "/manager#task-task-1");
});

test("submissions go directly to the review queue only for reviewers", () => {
  assert.equal(companyTaskHref("ADMIN", "admin", "task-1", "employee", true), "/reviews?task=task-1");
  assert.equal(companyTaskHref("MANAGER", "manager", "task-1", "employee", true), "/reviews?task=task-1");
  assert.equal(companyTaskHref("USER", "employee", "task-1", "employee", true), "/company-tasks?task=task-1");
});

test("task identifiers cannot introduce extra query parameters or fragments", () => {
  assert.equal(companyTaskHref("USER", "u", "task&view=board#x", "u"), "/company-tasks?task=task%26view%3Dboard%23x");
});
