import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { companyTaskAccessWhere } from "./company-task-access.ts";

const require = createRequire(import.meta.url);
function fixture(user, selected = { recurrenceId: null }) {
  const reads = [];
  const Board = () => null;
  const source = readFileSync(new URL("../app/(workspace)/company-tasks/[id]/page.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const dependencies = {
    "next/navigation": { redirect: () => { throw new Error("LOGIN"); }, notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/prisma": { prisma: {
      task: {
        findFirst: async query => { reads.push(query.where); return selected; },
        findMany: async query => { reads.push(query.where); return []; },
      },
      user: { findMany: async () => [] },
      taskReview: { findMany: async () => [] },
    } },
    "@/lib/company-task-access": { companyTaskAccessWhere },
    "@/lib/company-task-repeat": { companyTaskRepeatSelect: {}, serializeTaskRepeat: task => task },
    "@/lib/user-avatar": { USER_IDENTITY_SELECT: {}, withAvatarUrl: user => user },
    "@/services/company-tasks": { COMPANY_TASK_PROJECT_ID: "company" },
    "@/services/recurring-company-tasks": { ensureDailyCompanyTasks: async () => {} },
    "@/services/employee-leave": { getEmployeeLeave: async () => ({}) },
    "../company-task-board": Board,
  };
  const compiled = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), compiled, compiled.exports);
  return { reads, render: () => compiled.exports.default({ params: Promise.resolve({ id: "task-1" }) }) };
}

test("task detail pages enforce the same private access for employees, managers, and administrators", async () => {
  for (const role of ["USER", "MANAGER", "ADMIN"]) {
    const user = { id: "viewer", role };
    const page = fixture(user);
    const tree = await page.render();
    const scope = { projectId: "company", ...companyTaskAccessWhere(user), id: "task-1" };
    assert.deepEqual(page.reads, [scope, scope]);
    assert.equal(tree.props.detailTaskId, "task-1");
    assert.equal(tree.props.isAdmin, role === "ADMIN");
    assert.equal(tree.props.employeeId, user.id);
  }
});

test("missing or unauthorized tasks stop before loading details, and anonymous viewers must log in", async () => {
  const missing = fixture({ id: "viewer", role: "USER" }, null);
  await assert.rejects(missing.render(), /NOT_FOUND/);
  assert.equal(missing.reads.length, 1);
  const anonymous = fixture(null);
  await assert.rejects(anonymous.render(), /LOGIN/);
  assert.equal(anonymous.reads.length, 0);
});

test("daily task navigation loads only authorized occurrences in the selected series", async () => {
  const page = fixture({ id: "viewer", role: "USER" }, { recurrenceId: "daily-series" });
  await page.render();
  assert.deepEqual(page.reads[1], { projectId: "company", deletedAt: null, assigneeId: "viewer", recurrenceId: "daily-series" });
});
