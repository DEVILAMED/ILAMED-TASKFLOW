import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as series from "./company-task-series.ts";
import * as workdays from "./company-workdays.ts";
import * as dates from "./task-dates.ts";

const require = createRequire(import.meta.url);
const employee = { id: "employee", name: "Employee", email: "employee@example.com", employeeProfile: { employeeCode: "E001", designation: "Analyst", department: { id: "dept", name: "Operations" } } };
function fixture(user) {
  let query;
  const rows = ["19", "20"].map(day => ({
    id: `daily-${day}`, recurrenceId: "series", recurrenceDate: new Date(`2026-11-${day}T00:00:00Z`), recurrence: { isActive: true, endDate: null },
    title: "Daily work", description: "Recorded scope", status: "APPROVED", priority: "MEDIUM", assigneeId: employee.id, assignee: employee,
    assignedBy: { id: "admin", name: "Admin", email: "admin@example.com", role: "ADMIN" },
    createdAt: new Date(`2026-11-${day}T00:00:00Z`), startDate: new Date(`2026-11-${day}T00:00:00Z`), dueDate: new Date(`2026-11-${day}T00:00:00Z`),
    checklistItems: [{ title: "Verify", isCompleted: true }], statusHistory: [], comments: [],
    submissions: [{ submittedById: employee.id, submittedBy: employee, notes: "Evidence", createdAt: new Date(`2026-11-${day}T10:00:00Z`), images: [{ fileName: "proof.png" }], attachments: [{ fileName: "work.pdf" }], reviews: [{ id: `review-${day}`, decision: "APPROVED", rating: 4, feedback: "Good work", createdAt: new Date(`2026-11-${day}T11:00:00Z`), reviewer: { name: "Admin", email: "admin@example.com" } }] }],
  }));
  const Download = () => null;
  const dependencies = {
    "@/lib/auth": { getCurrentUser: async () => user },
    "next/navigation": { redirect: () => { throw new Error("LOGIN"); } },
    "@/lib/prisma": { prisma: {
      teamMembership: { findMany: async ({ where }) => where.userId ? [{ teamId: "managed-team" }] : [{ userId: "team-member" }] },
      task: { findMany: async args => { query = args; return rows; } },
    } },
    "@/services/company-tasks": { COMPANY_TASK_PROJECT_ID: "company" },
    "@/services/recurring-company-tasks": { ensureDailyCompanyTasks: async () => {} },
    "@/services/employee-leave": { getLeaveForTasks: async () => ({}) },
    "@/lib/company-task-series": series,
    "@/lib/company-task-repeat": { companyTaskRepeatSelect: {} },
    "@/lib/task-dates": dates,
    "@/lib/company-workdays": { ...workdays, employeeDayKey: () => "2026-11-20" },
    "./report-downloads": Download,
  };
  const source = readFileSync(new URL("../app/(workspace)/reports/page.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), compiled, compiled.exports);
  return { render: compiled.exports.default, query: () => query };
}

test("report evidence retains employee and manager access restrictions and selects file metadata only", async () => {
  for (const role of ["USER", "MANAGER", "ADMIN"]) {
    const page = fixture({ id: "viewer", role });
    await page.render();
    assert.deepEqual(page.query().where, { projectId: "company", ...(role === "ADMIN" ? {} : { assigneeId: { in: role === "MANAGER" ? ["viewer", "team-member"] : ["viewer"] } }) });
    assert.deepEqual(page.query().select.submissions.select.images, { select: { fileName: true } });
    assert.deepEqual(page.query().select.submissions.select.attachments, { select: { fileName: true } });
  }
});

test("report downloads receive all daily occurrences with serialized evidence and employee details", async () => {
  const page = fixture({ id: "viewer", role: "ADMIN" });
  const tree = await page.render();
  const tasks = tree.props.children[0].props.tasks;
  assert.deepEqual(tasks.map(task => task.id), ["daily-19", "daily-20"]);
  assert.equal(tasks[0].employeeCode, "E001");
  assert.equal(tasks[0].source, "Admin-assigned");
  assert.equal(tasks[0].submissions[0].createdAt, "2026-11-19T10:00:00.000Z");
  assert.deepEqual(tasks[0].submissions[0].files, ["proof.png", "work.pdf"]);
  assert.equal(tasks[0].submissions[0].reviews[0].feedback, "Good work");
  assert.doesNotThrow(() => JSON.stringify(tasks));
});

test("anonymous callers cannot load employee report evidence", async () => {
  const page = fixture(null);
  await assert.rejects(page.render(), /LOGIN/);
  assert.equal(page.query(), undefined);
});
