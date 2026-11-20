import assert from "node:assert/strict";
import test from "node:test";
import { canEditOwnCompanyTask, deleteManagedCompanyTask, parseCompanyTaskDetails, validateCompanyTaskUpdateFields, validateCompanyTaskDateRange } from "./company-task-management.ts";

const admin = { id: "admin", role: "ADMIN", name: "Administrator", email: "admin@example.com" };
const projectId = "company-task-tracker";

test("self-created task editing requires both authorship and current assignment", () => {
  assert.equal(canEditOwnCompanyTask("employee", { assignedById: "employee", assigneeId: "employee" }), true);
  for (const task of [{ assignedById: "admin", assigneeId: "employee" }, { assignedById: null, assigneeId: "employee" }, { assignedById: "employee", assigneeId: "other" }, {}]) {
    assert.equal(canEditOwnCompanyTask("employee", task), false);
  }
  assert.equal(canEditOwnCompanyTask(undefined, {}), false);
  for (const role of ["USER", "MANAGER"]) {
    assert.equal(validateCompanyTaskUpdateFields(role, ["title", "description", "startDate", "dueDate", "priority"], true).ok, true);
    for (const field of ["assigneeId", "assignedById", "projectId"]) assert.equal(validateCompanyTaskUpdateFields(role, [field], true).ok, false);
  }
});

test("employees and managers cannot edit task details even when mixed with an allowed progress update", () => {
  for (const role of ["USER", "MANAGER"]) {
    for (const field of ["title", "description", "startDate", "dueDate", "priority", "assigneeId"]) {
      for (const fields of [[field], ["status", field], ["action", "notes", field]]) {
        const result = validateCompanyTaskUpdateFields(role, fields);
        assert.equal(result.ok, false);
        assert.equal(result.status, 403);
      }
    }
    assert.equal(validateCompanyTaskUpdateFields(role, ["status", "notes"]).ok, true);
    assert.equal(validateCompanyTaskUpdateFields(role, ["action", "notes"]).ok, true);
  }
});

test("administrators can edit task details and unsupported fields remain rejected for every role", () => {
  assert.equal(validateCompanyTaskUpdateFields("ADMIN", ["title", "description", "startDate", "dueDate", "priority", "assigneeId"]).ok, true);
  for (const role of ["ADMIN", "MANAGER", "USER"]) {
    for (const field of ["projectId", "id", "role", "createdAt", "isAdmin"]) {
      assert.equal(validateCompanyTaskUpdateFields(role, [field]).ok, false);
    }
  }
});

test("task detail edits are partial and normalize text without adding status or assignment fields", () => {
  assert.deepEqual(parseCompanyTaskDetails({ title: "  Updated task  " }), { ok: true, data: { title: "Updated task" } });
  assert.deepEqual(parseCompanyTaskDetails({ description: "  New instructions  " }), { ok: true, data: { description: "New instructions" } });
  assert.deepEqual(parseCompanyTaskDetails({ description: "   ", dueDate: "" }), { ok: true, data: { description: null, dueDate: null } });
  assert.deepEqual(parseCompanyTaskDetails({ description: null, dueDate: null }), { ok: true, data: { description: null, dueDate: null } });
  assert.deepEqual(parseCompanyTaskDetails({ priority: "HIGH" }), { ok: true, data: {} });
});

test("task start and end dates retain the chosen calendar day in UTC", () => {
  for (const value of ["2026-11-17", "2024-02-29", "2026-12-31"]) {
    const result = parseCompanyTaskDetails({ startDate: value, dueDate: value });
    assert.equal(result.ok, true);
    assert.equal(result.data.startDate.toISOString(), `${value}T00:00:00.000Z`);
    assert.equal(result.data.dueDate.toISOString(), `${value}T00:00:00.000Z`);
  }
});

test("task ranges require both dates and permit same-day work", () => {
  const from = new Date("2026-11-17T00:00:00Z");
  const to = new Date("2026-11-20T00:00:00Z");
  assert.equal(validateCompanyTaskDateRange(from, to), null);
  assert.equal(validateCompanyTaskDateRange(from, from), null);
  assert.match(validateCompanyTaskDateRange(new Date(NaN), to), /valid/);
  assert.match(validateCompanyTaskDateRange(to, from), /on or after/);
  for (const [start, end] of [[null, to], [from, null], [null, null], [undefined, undefined]]) {
    assert.match(validateCompanyTaskDateRange(start, end), /both/);
  }
});

test("partial date edits are checked against the other saved boundary", () => {
  const saved = { startDate: new Date("2026-11-17T00:00:00Z"), dueDate: new Date("2026-11-20T00:00:00Z") };
  const laterStart = parseCompanyTaskDetails({ startDate: "2026-11-21" }).data;
  assert.match(validateCompanyTaskDateRange(laterStart.startDate, saved.dueDate), /on or after/);
  const earlierEnd = parseCompanyTaskDetails({ dueDate: "2026-11-16" }).data;
  assert.match(validateCompanyTaskDateRange(saved.startDate, earlierEnd.dueDate), /on or after/);
});

test("task edits reject invalid dates, oversized text, and incorrect field types", () => {
  for (const payload of [
    { title: " " }, { title: "a" }, { title: "x".repeat(201) }, { title: 42 }, { title: null },
    { description: "x".repeat(2001) }, { description: {} }, { description: false },
    ...["startDate", "dueDate"].flatMap((field) => ["2026-02-29", "2026-11-31", "2026-13-01", "2026-00-10", "0000-01-01", "2026-11-17T00:00:00Z", 123, {}, false].map((value) => ({ [field]: value }))),
  ]) assert.equal(parseCompanyTaskDetails(payload).ok, false);
});

function store(assigneeId = "employee") {
  const tasks = new Map([
    ["company-task", { id: "company-task", title: "Company task", projectId, assigneeId }],
    ["other-task", { id: "other-task", title: "Other project task", projectId: "other-project", assigneeId: "other-employee" }],
  ]);
  const related = Object.fromEntries(["comment", "taskLabel", "activity", "notification"].map((name) => [name, [{ taskId: "company-task" }, { taskId: "other-task" }]]));
  const notifications = [];
  let reads = 0;
  const transaction = {
    task: {
      async findFirst({ where }) {
        reads++;
        const task = tasks.get(where.id);
        return task?.projectId === where.projectId ? { ...task } : null;
      },
      async delete({ where }) {
        const task = tasks.get(where.id);
        assert.equal(task.projectId, where.projectId);
        if (["comment", "taskLabel"].some((name) => related[name].some((item) => item.taskId === task.id))) throw new Error("Foreign key constraint");
        tasks.delete(task.id);
        return task;
      },
    },
    ...Object.fromEntries(Object.keys(related).map((name) => [name, {
      async deleteMany({ where }) { related[name] = related[name].filter((item) => item.taskId !== where.taskId); },
    }])),
  };
  transaction.notification.create = async ({ data }) => { notifications.push(data); return data; };
  return { transaction, tasks, related, notifications, reads: () => reads };
}

test("employees, managers, and anonymous callers cannot delete company tasks", async () => {
  for (const actor of [null, { ...admin, role: "USER" }, { ...admin, role: "MANAGER" }]) {
    const fixture = store();
    const result = await deleteManagedCompanyTask(fixture.transaction, actor, "company-task", projectId);
    assert.equal(result.ok, false);
    assert.equal(result.status, actor ? 403 : 401);
    assert.equal(fixture.reads(), 0);
    assert.equal(fixture.tasks.size, 2);
    assert.equal(fixture.notifications.length, 0);
  }
});

test("company deletion cannot touch another project's task or a missing task", async () => {
  for (const taskId of ["other-task", "missing"]) {
    const fixture = store();
    const result = await deleteManagedCompanyTask(fixture.transaction, admin, taskId, projectId);
    assert.equal(result.status, 404);
    assert.equal(fixture.tasks.size, 2);
    for (const rows of Object.values(fixture.related)) assert.equal(rows.length, 2);
    assert.equal(fixture.notifications.length, 0);
  }
});

test("deleting a task with related records preserves other tasks and notifies its assignee", async () => {
  const fixture = store();
  const result = await deleteManagedCompanyTask(fixture.transaction, admin, "company-task", projectId);
  assert.equal(result.ok, true);
  assert.equal(fixture.tasks.has("company-task"), false);
  assert.equal(fixture.tasks.has("other-task"), true);
  for (const rows of Object.values(fixture.related)) assert.deepEqual(rows, [{ taskId: "other-task" }]);
  assert.equal(fixture.notifications.length, 1);
  assert.equal(fixture.notifications[0].userId, "employee");
  assert.equal(fixture.notifications[0].type, "TASK_UNASSIGNED");
  assert.match(fixture.notifications[0].message, /deleted "Company task"/);
  assert.equal("taskId" in fixture.notifications[0], false, "Deletion notices must not link to a deleted task");
});

test("unassigned tasks can be deleted without a notification", async () => {
  const fixture = store(null);
  assert.equal((await deleteManagedCompanyTask(fixture.transaction, admin, "company-task", projectId)).ok, true);
  assert.equal(fixture.notifications.length, 0);
});

test("relation cleanup failures stop deletion and propagate to the transaction", async () => {
  const fixture = store();
  fixture.transaction.comment.deleteMany = async () => { throw new Error("Storage unavailable"); };
  await assert.rejects(deleteManagedCompanyTask(fixture.transaction, admin, "company-task", projectId), /Storage unavailable/);
  assert.equal(fixture.tasks.has("company-task"), true);
  assert.equal(fixture.notifications.length, 0);
});
