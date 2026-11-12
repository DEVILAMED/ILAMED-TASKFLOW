import assert from "node:assert/strict";
import test from "node:test";
import { canChangeCompanyTaskStatus } from "./company-task-workflow.ts";

test("employees cannot authorize holds or resume approved holds", () => {
  for (const status of ["TODO", "ACCEPTED", "IN_PROGRESS", "REVISION_REQUESTED", "ON_HOLD"]) {
    assert.equal(canChangeCompanyTaskStatus("USER", false, status, "ON_HOLD"), false);
  }
  assert.equal(canChangeCompanyTaskStatus("USER", false, "ON_HOLD", "IN_PROGRESS"), false);
  assert.equal(canChangeCompanyTaskStatus("USER", true, "ON_HOLD", "IN_PROGRESS"), false);
});

test("admins and responsible managers can hold active tasks and resume holds", () => {
  for (const [role, manages] of [["ADMIN", false], ["MANAGER", true]]) {
    for (const status of ["TODO", "ACCEPTED", "IN_PROGRESS", "REVISION_REQUESTED"]) {
      assert.equal(canChangeCompanyTaskStatus(role, manages, status, "ON_HOLD"), true);
    }
    assert.equal(canChangeCompanyTaskStatus(role, manages, "ON_HOLD", "IN_PROGRESS"), true);
    for (const status of ["APPROVED", "DONE", "CANCELLED", "REJECTED", "SUBMITTED_FOR_REVIEW"]) {
      assert.equal(canChangeCompanyTaskStatus(role, manages, status, "ON_HOLD"), false);
      assert.equal(canChangeCompanyTaskStatus(role, manages, status, "IN_PROGRESS"), false);
    }
  }
});

test("manager role alone does not confer management authority over a task", () => {
  assert.equal(canChangeCompanyTaskStatus("MANAGER", false, "IN_PROGRESS", "ON_HOLD"), false);
  assert.equal(canChangeCompanyTaskStatus("MANAGER", false, "ON_HOLD", "IN_PROGRESS"), false);
  assert.equal(canChangeCompanyTaskStatus("MANAGER", true, "IN_PROGRESS", "CANCELLED"), false);
});

test("employee work and review transitions remain available", () => {
  assert.equal(canChangeCompanyTaskStatus("USER", false, "TODO", "IN_PROGRESS"), true);
  assert.equal(canChangeCompanyTaskStatus("USER", false, "IN_PROGRESS", "SUBMITTED_FOR_REVIEW"), true);
  assert.equal(canChangeCompanyTaskStatus("USER", false, "REVISION_REQUESTED", "SUBMITTED_FOR_REVIEW"), true);
  assert.equal(canChangeCompanyTaskStatus("USER", false, "IN_PROGRESS", "APPROVED"), false);
});
