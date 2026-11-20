import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { Prisma } from "@prisma/client";
import { deleteManagedCompanyTask } from "./company-task-management.ts";
import { companyTaskAccessWhere } from "./company-task-access.ts";

const require = createRequire(import.meta.url);
const admin = { id: "admin", role: "ADMIN", name: "Admin", email: "admin@example.com" };
function fixture() {
  const state = { task: { id: "task", projectId: "company", title: "Approved work", assigneeId: "employee", createdById: "employee", status: "APPROVED", archivedAt: null, deletedAt: null, updatedAt: new Date("2026-11-20T00:00:00Z") }, checklist: { id: "step", taskId: "task", title: "Verify", isCompleted: false, position: 0 }, changes: [], uploads: [{ id: "file", data: "retained evidence" }], notifications: [], failAudit: false, reads: 0 };
  let actor = admin;
  const matches = where => Object.entries(where).every(([key, expected]) => {
    if (key === "OR") return expected.some(matches);
    const current = state.task[key] ?? null;
    if (expected instanceof Date) return current?.getTime() === expected.getTime();
    if (expected && typeof expected === "object" && "not" in expected) return current !== expected.not;
    return current === expected;
  });
  const database = {
    task: {
      findFirst: async ({ where }) => { state.reads++; return matches(where) ? structuredClone(state.task) : null; },
      updateMany: async ({ where, data }) => { if (!matches(where)) return { count: 0 }; Object.assign(state.task, data); return { count: 1 }; },
      update: async ({ where, data }) => {
        if (!matches(where)) throw new Prisma.PrismaClientKnownRequestError("Conflict", { code: "P2025", clientVersion: "test" });
        Object.assign(state.task, data); state.task.updatedAt = new Date(state.task.updatedAt.getTime() + 1); return structuredClone(state.task);
      },
    },
    companyTaskChecklistItem: {
      findFirst: async ({ where }) => where.id === state.checklist.id && where.taskId === state.task.id ? { ...state.checklist } : null,
      updateMany: async ({ where, data }) => { if (where.id !== state.checklist.id || where.taskId !== state.task.id) return { count: 0 }; Object.assign(state.checklist, data); return { count: 1 }; },
      findUnique: async () => ({ ...state.checklist }),
    },
    taskChange: { create: async ({ data }) => { if (state.failAudit) throw new Error("Audit unavailable"); state.changes.push(data); } },
    notification: { create: async ({ data }) => state.notifications.push(data) },
    $transaction: async run => {
      const snapshot = structuredClone(state);
      try { return await run(database); } catch (error) { Object.assign(state, snapshot); throw error; }
    },
  };
  const dependencies = { "@/lib/auth": { getCurrentUser: async () => actor }, "@/lib/prisma": { prisma: database }, "@/services/company-tasks": { COMPANY_TASK_PROJECT_ID: "company" } };
  function load(path) {
    const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const compiled = { exports: {} };
    new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), compiled, compiled.exports);
    return compiled.exports;
  }
  const lifecycle = load("../app/api/company-tasks/[id]/lifecycle/route.ts");
  const checklist = load("../app/api/company-tasks/[id]/checklist/[stepId]/route.ts");
  return { state, database, setActor: user => { actor = user; },
    checklist: completed => checklist.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ isCompleted: completed }) }), { params: Promise.resolve({ id: "task", stepId: "step" }) }),
    action: action => lifecycle.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ action }) }), { params: Promise.resolve({ id: "task" }) }),
  };
}

test("only administrators can archive, unarchive or restore tasks", async () => {
  for (const role of ["USER", "MANAGER", null]) {
    const api = fixture(); api.setActor(role ? { ...admin, role } : null);
    for (const action of ["ARCHIVE", "UNARCHIVE", "RESTORE"]) assert.equal((await api.action(action)).status, role ? 403 : 401);
    assert.equal(api.state.reads, 0); assert.equal(api.state.changes.length, 0);
  }
});

test("archiving and unarchiving preserve task contents, authorship and evidence with a durable change log", async () => {
  const api = fixture();
  assert.equal((await api.action("ARCHIVE")).status, 200);
  assert.ok(api.state.task.archivedAt instanceof Date);
  assert.equal(api.state.task.createdById, "employee");
  assert.equal(api.state.uploads[0].data, "retained evidence");
  assert.equal(api.state.changes[0].action, "ARCHIVE");
  assert.equal((await api.action("UNARCHIVE")).status, 200);
  assert.equal(api.state.task.archivedAt, null);
  assert.equal(api.state.task.status, "APPROVED");
  assert.equal(api.state.changes[1].action, "UNARCHIVE");
});

test("active tasks cannot be archived and unsupported actions cannot alter lifecycle state", async () => {
  const api = fixture(); api.state.task.status = "IN_PROGRESS";
  assert.equal((await api.action("ARCHIVE")).status, 409);
  for (const action of ["PURGE", "DELETE", "", null]) assert.equal((await api.action(action)).status, 400);
  assert.equal(api.state.task.archivedAt, null); assert.equal(api.state.changes.length, 0);
});

test("recycling and restoration preserve uploads, archived state, creator and previous approval", async () => {
  const api = fixture();
  await api.action("ARCHIVE");
  const archivedAt = api.state.task.archivedAt;
  await api.database.$transaction(tx => deleteManagedCompanyTask(tx, admin, "task", "company"));
  assert.ok(api.state.task.deletedAt instanceof Date);
  assert.equal((await api.database.task.findFirst({ where: { id: "task", ...companyTaskAccessWhere(admin) } })), null);
  assert.equal((await api.action("UNARCHIVE")).status, 404);
  assert.equal((await api.action("RESTORE")).status, 200);
  assert.equal(api.state.task.deletedAt, null);
  assert.deepEqual(api.state.task.archivedAt, archivedAt);
  assert.equal(api.state.task.status, "APPROVED");
  assert.equal(api.state.task.createdById, "employee");
  assert.deepEqual(api.state.uploads, [{ id: "file", data: "retained evidence" }]);
  assert.deepEqual(api.state.changes.map(change => change.action), ["ARCHIVE", "TRASHED", "RESTORE"]);
});

test("failed audit writes roll back archive and recycle changes", async () => {
  const api = fixture(); api.state.failAudit = true;
  await assert.rejects(api.action("ARCHIVE"), /Audit unavailable/);
  assert.equal(api.state.task.archivedAt, null);
  await assert.rejects(api.database.$transaction(tx => deleteManagedCompanyTask(tx, admin, "task", "company")), /Audit unavailable/);
  assert.equal(api.state.task.deletedAt, null); assert.equal(api.state.notifications.length, 0);
});

test("lifecycle actions cannot touch another project's task or restore an active task", async () => {
  const api = fixture();
  assert.equal((await api.action("RESTORE")).status, 404);
  api.state.task.projectId = "other-project";
  assert.equal((await api.action("ARCHIVE")).status, 404);
  assert.equal(api.state.changes.length, 0);
});

test("checklist progress is logged and cannot alter submitted, archived or recycled evidence", async () => {
  const api = fixture(); api.setActor({ ...admin, id: "employee", role: "USER" });
  api.state.task.status = "IN_PROGRESS";
  assert.equal((await api.checklist(true)).status, 200);
  assert.equal(api.state.checklist.isCompleted, true);
  assert.equal(api.state.changes[0].action, "CHECKLIST_UPDATED");
  assert.equal(api.state.changes[0].before.isCompleted, false);
  assert.equal(api.state.changes[0].after.isCompleted, true);
  api.state.task.status = "SUBMITTED_FOR_REVIEW";
  assert.equal((await api.checklist(false)).status, 404);
  api.state.task.status = "IN_PROGRESS"; api.state.task.archivedAt = new Date();
  assert.equal((await api.checklist(false)).status, 404);
  api.state.task.archivedAt = null; api.state.task.deletedAt = new Date();
  assert.equal((await api.checklist(false)).status, 404);
  assert.equal(api.state.checklist.isCompleted, true);
  assert.equal(api.state.changes.length, 1);
});
