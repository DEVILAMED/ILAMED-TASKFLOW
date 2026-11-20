import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import ts from "typescript";
import * as repeat from "./company-task-repeat.ts";
import * as series from "./company-task-series.ts";

const require = createRequire(import.meta.url);
const Details = () => null;
const Tasks = () => null;
function fixture(user, allowedIds = ["manager", "employee"], missing = false) {
  const calls = [];
  const employee = { id: "employee", name: "Employee", email: "employee@example.com", avatar: null, role: "USER", isBlocked: false, createdAt: new Date("2026-01-01"), lastSeenAt: null, employeeProfile: { employeeCode: "E001", phone: "123456", designation: "Analyst", joiningDate: new Date("2026-01-01"), employmentStatus: "ACTIVE", department: { name: "Operations" }, manager: { name: "Manager", email: "manager@example.com" } }, teamMemberships: [{ role: "MEMBER", team: { id: "team", name: "Operations" } }] };
  const tasks = ["20", "21"].map(day => ({ id: `task-${day}`, title: "Inspection", description: "Check equipment", status: "TODO", priority: "HIGH", assigneeId: "employee", startDate: new Date(`2026-11-${day}`), dueDate: new Date(`2026-11-${day}`), recurrenceId: "daily", recurrenceDate: new Date(`2026-11-${day}`), recurrence: { isActive: true, startDate: new Date("2026-11-20"), endDate: null }, createdAt: new Date(`2026-11-${day}`), updatedAt: new Date(`2026-11-${day}`), assignedBy: { name: "Manager", email: "manager@example.com" }, checklistItems: [{ id: "step", title: "Check", isCompleted: false }], comments: [{ id: "comment", content: "Update", createdAt: new Date(`2026-11-${day}`), user: { name: "Employee", email: "employee@example.com" } }] }));
  const dependencies = {
    "@/lib/auth": { getCurrentUser: async () => user },
    "next/navigation": { redirect: href => { throw new Error(`redirect:${href}`); }, notFound: () => { throw new Error("not-found"); } },
    "@/services/workspace-reporting": { companyReportingEmployeeIds: async () => user.role === "ADMIN" ? undefined : allowedIds },
    "@/lib/prisma": { prisma: {
      task: { findMany: async options => { calls.push(["tasks", options]); return tasks; } },
      user: { findUnique: async options => { calls.push(["employee", options]); return missing ? null : { ...employee, id: options.where.id }; } },
    } },
    "@/services/company-tasks": { COMPANY_TASK_PROJECT_ID: "company" },
    "@/services/review-quality": { getReviewEvidence: async (_period, ids) => { calls.push(["reviews", ids]); return []; } },
    "@/lib/review-quality": { getReviewPeriod: value => ({ value: value || "month" }), summarizeReviewQuality: () => ({}) },
    "@/lib/user-avatar": { USER_IDENTITY_SELECT: { id: true, name: true, email: true, avatar: true }, userAvatarUrl: () => null },
    "@/services/employee-leave": { getEmployeeLeave: async () => ({ employee: ["2026-11-23"] }) },
    "@/services/recurring-company-tasks": { ensureDailyCompanyTasks: async () => {} },
    "@/lib/company-task-repeat": repeat,
    "@/lib/company-task-series": series,
    "@/app/performance-view": () => null,
    "@/app/team-member-details": Details,
    "@/app/team-member-tasks": Tasks,
  };
  const code = ts.transpileModule(readFileSync(new URL("../app/(workspace)/performance/page.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), loaded, loaded.exports);
  return { calls, page: params => loaded.exports.default({ searchParams: Promise.resolve(params) }) };
}

test("clicking a team member exposes their profile, complete daily task history and same-screen details", async () => {
  const api = fixture({ id: "admin", role: "ADMIN" });
  const tree = await api.page({ employee: "employee" });
  const children = React.Children.toArray(tree.props.memberDetails.props.children);
  const details = children.find(child => child.type === Details);
  const tasks = children.find(child => child.type === Tasks);
  assert.equal(details.props.employee.employeeProfile.employeeCode, "E001");
  assert.deepEqual(details.props.leaveDays, ["2026-11-23"]);
  assert.equal(details.props.backHref, "/admin/employees");
  assert.equal(tasks.props.tasks.length, 2);
  assert.equal(tasks.props.tasks[0].title, "Inspection");
  assert.equal(tasks.props.tasks[0].checklistItems[0].title, "Check");
  assert.equal(tasks.props.tasks[0].comments[0].createdAt, "2026-11-20T00:00:00.000Z");
  assert.equal(tree.props.tasks.length, 1);
  assert.deepEqual(api.calls.find(([kind]) => kind === "tasks")[1].where, { projectId: "company", assigneeId: { in: ["employee"] } });
  assert.equal(api.calls.find(([kind]) => kind === "employee")[1].select.password, undefined);
});

test("a manager can view their own team member but cannot request someone outside their scope", async () => {
  const api = fixture({ id: "manager", role: "MANAGER" });
  const allowed = await api.page({ employee: "employee" });
  assert.equal(React.Children.toArray(allowed.props.memberDetails.props.children)[0].props.backHref, "/manager");
  const denied = fixture({ id: "manager", role: "MANAGER" });
  await assert.rejects(denied.page({ employee: "outsider" }), /not-found/);
  assert.equal(denied.calls.length, 0);
});

test("ordinary users remain scoped to themselves even with another employee in the URL", async () => {
  const api = fixture({ id: "self", role: "USER" }, ["self"]);
  const tree = await api.page({ employee: "other" });
  assert.equal(tree.props.employee, "self");
  assert.deepEqual(api.calls.find(([kind]) => kind === "tasks")[1].where.assigneeId.in, ["self"]);
});

test("anonymous and missing-member requests cannot render a member profile", async () => {
  const anonymous = fixture(null);
  await assert.rejects(anonymous.page({ employee: "employee" }), /redirect:\/login/);
  assert.equal(anonymous.calls.length, 0);
  await assert.rejects(fixture({ id: "admin", role: "ADMIN" }, [], true).page({ employee: "missing" }), /not-found/);
});
