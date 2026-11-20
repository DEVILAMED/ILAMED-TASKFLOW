import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import ts from "typescript";
import * as departments from "./employee-departments.ts";
import * as quality from "./review-quality.ts";
import * as workdays from "./company-workdays.ts";
import * as avatars from "./user-avatar.ts";
import * as dates from "./task-dates.ts";
import * as repeatHelpers from "./company-task-repeat.ts";
import * as seriesHelpers from "./company-task-series.ts";

const require = createRequire(import.meta.url);
function load(path, dependencies, FormDataClass = FormData) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  new Function("require", "module", "exports", "FormData", code)(name => dependencies[name] ?? require(name), compiled, compiled.exports, FormDataClass);
  return compiled.exports;
}

const options = [{ id: "operations", name: "Operations" }, { id: "sales", name: "Sales" }];
const admin = { id: "admin", role: "ADMIN", name: "Admin", email: "admin@example.com" };
const people = [
  { id: "ops", departmentId: "operations" }, { id: "sales", departmentId: "sales" },
  { id: "no-profile" }, { id: "unassigned", departmentId: null },
].map(person => ({
  id: person.id, name: person.id, email: `${person.id}@example.com`, avatar: null, role: "USER", isBlocked: false,
  createdAt: new Date("2026-11-18T00:00:00Z"), lastSeenAt: null,
  employeeProfile: "departmentId" in person ? { departmentId: person.departmentId, designation: "Employee", joiningDate: null, employmentStatus: "ACTIVE" } : null,
}));
const tasks = [...people, null].map((person, index) => ({
  id: `task-${index}`, projectId: "company", title: `Task ${index}`, description: null, status: "TODO", priority: "MEDIUM",
  createdAt: new Date("2026-11-18T00:00:00Z"), updatedAt: new Date("2026-11-18T00:00:00Z"), startDate: null, dueDate: null,
  assigneeId: person?.id ?? null, assignee: person, checklistItems: [],
}));

function matches(record, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(clause => matches(record, clause));
    if (key === "AND") return value.every(clause => matches(record, clause));
    if (value && typeof value === "object") {
      if ("not" in value) return record?.[key] !== value.not;
      return record?.[key] != null && matches(record[key], value);
    }
    return record?.[key] === value;
  });
}

test("department views include their own employees and unassigned employees, including missing profiles", () => {
  for (const [selection, expected] of [
    ["ALL", ["ops", "sales", "no-profile", "unassigned"]],
    ["operations", ["ops", "no-profile", "unassigned"]],
    ["sales", ["sales", "no-profile", "unassigned"]],
    ["UNASSIGNED", ["no-profile", "unassigned"]],
  ]) {
    assert.deepEqual(people.filter(person => departments.matchesDepartment(person.employeeProfile?.departmentId, selection)).map(person => person.id), expected);
    assert.deepEqual(people.filter(person => matches(person, departments.departmentEmployeeWhere(selection))).map(person => person.id), expected);
    assert.deepEqual(tasks.filter(task => matches(task, departments.departmentTaskWhere(selection))).map(task => task.assigneeId), [...expected, null]);
  }
});

test("department links preserve task views and anchors, and invalid selections fall back to all departments", () => {
  assert.equal(departments.resolveDepartmentFilter("operations", options), "operations");
  assert.equal(departments.resolveDepartmentFilter("UNASSIGNED", options), "UNASSIGNED");
  for (const value of [undefined, "deleted", ["operations", "sales"]]) assert.equal(departments.resolveDepartmentFilter(value, options), "ALL");
  assert.equal(departments.departmentHref("/admin?view=calendar#tasks", "operations"), "/admin?view=calendar&department=operations#tasks");
  assert.equal(departments.departmentHref("/admin?view=calendar&department=operations", "ALL"), "/admin?view=calendar");
});

function findElement(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

const elementOfType = (tree, type) => findElement(tree, element => element.type === type);

test("dashboard totals, team accounts, tasks and calendars use the same department selection", async () => {
  const Overview = () => null, Presence = () => null, Board = () => null;
  const prisma = {
    department: { findMany: async () => options },
    user: { findMany: async ({ where = {} }) => [...people, { ...admin, avatar: null, employeeProfile: null, createdAt: new Date(), lastSeenAt: null }].filter(person => matches(person, where)) },
    task: { findMany: async ({ where }) => tasks.filter(task => matches(task, where)) },
    taskStatusHistory: { findMany: async () => [] },
  };
  const dependencies = {
    "@/lib/auth": { getCurrentUser: async () => admin }, "@/lib/prisma": { prisma },
    "@/lib/employee-departments": departments, "@/lib/review-quality": quality, "@/lib/company-workdays": workdays,
    "@/lib/task-dates": dates, "@/lib/employee-dashboard": { employeeDayKey: workdays.employeeDayKey },
    "@/lib/user-avatar": avatars, "@/services/company-tasks": { COMPANY_TASK_PROJECT_ID: "company" },
    "@/lib/company-task-repeat": repeatHelpers, "@/lib/company-task-series": seriesHelpers, "@/services/recurring-company-tasks": { ensureDailyCompanyTasks: async () => {} },
    "@/services/employee-leave": { getEmployeeLeave: async () => ({}) }, "@/services/review-quality": { getReviewEvidence: async () => [] },
    "./overview-dashboard": Overview, "./overview.css": {}, "../employee-presence": Presence,
    "@/app/(workspace)/company-tasks/company-task-board": Board,
    "@/app/workspace-page-heading": () => null, "@/app/new-company-task-dialog": { NewTaskButton: () => null },
    "@/app/admin-department-switcher": () => null, "@/app/review-quality-badge": () => null, "@/app/user-avatar": () => null,
  };
  const overview = load("../app/(workspace)/admin/overview/page.tsx", dependencies).default;
  const team = load("../app/(workspace)/admin/employees/page.tsx", dependencies).default;
  const board = load("../app/(workspace)/admin/page.tsx", dependencies).default;
  for (const [selection, count, total] of [["operations", 3, 4], ["sales", 3, 4], ["UNASSIGNED", 2, 3], ["ALL", 4, 5], ["deleted", 4, 5]]) {
    const props = { searchParams: Promise.resolve({ department: selection, view: "calendar" }) };
    const dashboard = elementOfType(await overview(props), Overview).props;
    assert.equal(dashboard.counts.employees, count);
    assert.equal(dashboard.counts.total, total);
    const accounts = elementOfType(await team(props), Presence).props.employees;
    assert.equal(accounts.filter(person => person.role !== "ADMIN").length, count);
    assert.ok(accounts.some(person => person.id === admin.id), "Administrators remain accessible in every department view");
    assert.deepEqual(accounts.filter(person => person.role !== "ADMIN").map(person => person.id), dashboard.employees.map(person => person.id));
    const taskBoard = elementOfType(await board(props), Board).props;
    assert.equal(taskBoard.employees.length, count);
    assert.equal(taskBoard.initialTasks.length, total);
  }
});

test("quick department assignment preserves profile details and requires administrator access", async () => {
  let actor = admin;
  let writes = 0;
  const profile = { userId: "ops", departmentId: "operations", designation: "Coordinator", employeeCode: "E-42" };
  const prisma = {
    user: { findFirst: async ({ where }) => where.id === "ops" ? people[0] : null },
    department: { findUnique: async ({ where }) => options.find(department => department.id === where.id) ?? null },
    employeeProfile: { upsert: async ({ update }) => { writes++; Object.assign(profile, update); return profile; } },
    $transaction: async callback => callback(prisma),
  };
  const route = load("../app/api/admin/users/[id]/profile/route.ts", { "@/lib/auth": { getCurrentUser: async () => actor }, "@/lib/prisma": { prisma } });
  const update = (departmentId) => route.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ departmentId }) }), { params: Promise.resolve({ id: "ops" }) });
  assert.equal((await update("sales")).status, 200);
  assert.deepEqual(profile, { userId: "ops", departmentId: "sales", designation: "Coordinator", employeeCode: "E-42" });
  assert.equal((await update(null)).status, 200);
  assert.equal(profile.departmentId, null);
  assert.equal((await update("missing")).status, 400);
  for (const role of ["USER", "MANAGER"]) {
    actor = { ...admin, role };
    assert.equal((await update("sales")).status, 403);
  }
  actor = null;
  assert.equal((await update("sales")).status, 401);
  assert.equal(writes, 2);
});

function hookState() {
  const values = [];
  let index = 0;
  return {
    reset: () => { index = 0; },
    react: { ...React, useState: initial => {
      const slot = index++;
      if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
      return [values[slot], value => { values[slot] = typeof value === "function" ? value(values[slot]) : value; }];
    }, useTransition: () => [false, action => action()] },
  };
}

test("dashboard creation selects the new department and switching clears the previous employee selection", async (t) => {
  const hooks = hookState();
  const navigations = [];
  let refreshes = 0;
  let sent;
  t.mock.method(globalThis, "fetch", async (url, request) => {
    sent = { url, method: request.method, body: JSON.parse(request.body) };
    return { ok: true, json: async () => ({ ok: true, department: { id: "new-department", name: "New department" } }) };
  });
  const Switcher = load("../app/admin-department-switcher.tsx", {
    react: hooks.react, "@/lib/employee-departments": departments,
    "next/navigation": { usePathname: () => "/admin", useSearchParams: () => new URLSearchParams("view=calendar&employee=ops&task=task-1"), useRouter: () => ({ push: href => navigations.push(href), refresh: () => refreshes++ }) },
  }, class { constructor(values) { this.values = values; } get(key) { return this.values[key] ?? null; } }).default;
  const render = () => { hooks.reset(); return Switcher({ departments: options, selectedDepartment: "ALL" }); };
  let tree = render();
  elementOfType(tree, "select").props.onChange({ target: { value: "sales" } });
  assert.equal(navigations.at(-1), "/admin?view=calendar&department=sales");
  elementOfType(tree, "button").props.onClick();
  tree = render();
  await elementOfType(tree, "form").props.onSubmit({ preventDefault() {}, currentTarget: { name: "New department", description: "Support team" } });
  await new Promise(setImmediate);
  assert.deepEqual(sent, { url: "/api/departments", method: "POST", body: { name: "New department", description: "Support team" } });
  assert.equal(navigations.at(-1), "/admin?view=calendar&department=new-department");
  assert.equal(refreshes, 1);
});

test("quick assignment refreshes the dashboard on success and displays errors without reporting success", async (t) => {
  const hooks = hookState();
  let refreshes = 0;
  let succeed = true;
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, "/api/admin/users/ops/profile");
    assert.deepEqual(JSON.parse(request.body), { departmentId: "sales" });
    return { ok: succeed, json: async () => succeed ? { ok: true } : { ok: false, error: "Department not found." } };
  });
  const Control = load("../app/employee-department-control.tsx", { react: hooks.react, "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) } }).default;
  const render = () => { hooks.reset(); return Control({ employeeId: "ops", employeeName: "Operations employee", departmentId: "operations", departments: options }); };
  let tree = render();
  await elementOfType(tree, "select").props.onChange({ target: { value: "sales" } });
  await new Promise(setImmediate);
  tree = render();
  assert.equal(refreshes, 1);
  assert.ok(findElement(tree, element => element.props.role === "status"));
  succeed = false;
  await elementOfType(tree, "select").props.onChange({ target: { value: "sales" } });
  await new Promise(setImmediate);
  tree = render();
  assert.equal(refreshes, 1);
  assert.equal(elementOfType(tree, "p").props.role, "alert");
  assert.equal(elementOfType(tree, "p").props.children, "Department not found.");
});
