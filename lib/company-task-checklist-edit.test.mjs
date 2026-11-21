import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as management from "./company-task-management.ts";
import { companyTaskAccessWhere } from "./company-task-access.ts";

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL("../app/api/company-tasks/[id]/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(overrides = {}, user = { id: "employee", role: "USER" }) {
  const task = { id: "task", title: "Report", description: null, priority: "MEDIUM", createdById: "employee", assigneeId: "employee", assignedById: "employee", assignee: null, archivedAt: null, deletedAt: null, status: "IN_PROGRESS", startDate: new Date("2026-11-20"), dueDate: new Date("2026-11-21"), updatedAt: new Date(), checklistItems: [{ id: "keep", title: "Keep", isCompleted: true }, { id: "remove", title: "Remove", isCompleted: false }], ...overrides };
  const writes = [];
  const changes = [];
  const database = {
    task: {
      findFirst: async () => structuredClone(task),
      update: async ({ data }) => {
        writes.push(data);
        const { checklistItems, ...details } = data;
        Object.assign(task, details);
        if (checklistItems) {
          task.checklistItems = task.checklistItems.filter(item => checklistItems.deleteMany.id.notIn.includes(item.id));
          for (const edit of checklistItems.update) Object.assign(task.checklistItems.find(item => item.id === edit.where.id), edit.data);
          for (const item of checklistItems.create) task.checklistItems.push({ id: "new", ...item });
          task.checklistItems.sort((a, b) => a.position - b.position);
        }
        return structuredClone(task);
      },
    },
    taskChange: { create: async ({ data }) => changes.push(data) },
    notification: { create: async () => {} },
    $transaction: async run => run(database),
  };
  const dependencies = {
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/prisma": { prisma: database },
    "@/lib/company-task-management": management,
    "@/lib/company-task-access": { companyTaskAccessWhere },
    "@/services/company-tasks": { COMPANY_TASK_PROJECT_ID: "company" },
    "@/lib/company-task-workflow": { canChangeCompanyTaskStatus: () => false },
    "@/lib/user-avatar": { USER_IDENTITY_SELECT: {}, withAvatarUrl: value => value },
    "@/lib/company-task-repeat": { companyTaskRepeatSelect: {}, serializeTaskRepeat: value => value },
    "@/lib/task-evidence": { taskEvidenceSnapshot: value => ({ checklist: value.checklistItems.map(({ title, isCompleted }) => ({ title, isCompleted })) }) },
    "@/lib/submission-images": { validateSubmissionImages: () => null },
    "@/lib/submission-attachments": { validateSubmissionAttachments: () => null },
    "@/lib/prepare-submission-attachment": {},
    "@/lib/limited-form-data": {},
    "@/lib/prepare-submission-image": {},
  };
  const compiled = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), compiled, compiled.exports);
  return { task, writes, changes,
    patch: checklistItems => compiled.exports.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ checklistItems }) }), { params: Promise.resolve({ id: "task" }) }),
    delete: () => compiled.exports.DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "task" }) }),
  };
}

test("creator can add, rename and remove checklist items without losing completion or history", async () => {
  const api = fixture();
  const response = await api.patch([{ id: "keep", title: "Renamed" }, { title: "New" }]);
  assert.equal(response.status, 200);
  const { task } = await response.json();
  assert.deepEqual(task.checklistItems, [{ id: "keep", title: "Renamed", isCompleted: true, position: 0 }, { id: "new", title: "New", isCompleted: false, position: 1 }]);
  assert.equal(api.changes[0].action, "DETAILS_EDITED");
  assert.equal(api.changes[0].before.checklist[0].title, "Keep");
  assert.equal(api.changes[0].after.checklist[0].title, "Renamed");
});

test("creator can clear a checklist", async () => {
  const api = fixture();
  assert.equal((await api.patch([])).status, 200);
  assert.deepEqual(api.task.checklistItems, []);
});

test("checklist edits reject non-creators, foreign IDs, and protected task states", async () => {
  for (const [overrides, items, status] of [
    [{ createdById: "admin" }, [], 403],
    [{}, [{ id: "foreign", title: "Other task" }], 400],
    [{ archivedAt: new Date() }, [], 409],
    ...["SUBMITTED_FOR_REVIEW", "APPROVED", "DONE", "CANCELLED"].map(status => [{ status }, [], 409]),
  ]) {
    const api = fixture(overrides);
    assert.equal((await api.patch(items)).status, status);
    assert.equal(api.writes.length, 0);
    assert.equal(api.changes.length, 0);
  }
});

test("DELETE route permits the creator and rejects a different employee", async () => {
  const own = fixture();
  assert.equal((await own.delete()).status, 200);
  assert.ok(own.task.deletedAt instanceof Date);
  const other = fixture({ createdById: "another-employee" });
  assert.equal((await other.delete()).status, 403);
  assert.equal(other.writes.length, 0);
});
