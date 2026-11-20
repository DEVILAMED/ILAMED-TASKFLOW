import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import ts from "typescript";
import * as workdays from "./company-workdays.ts";
import * as dates from "./task-dates.ts";
import * as approvalFilters from "./approval-filters.ts";

const require = createRequire(import.meta.url);
function component(path, props, globals = {}, initialState = []) {
  const state = [...initialState];
  let index = 0;
  const dependencies = {
    react: { ...React, useCallback: callback => callback, useEffect() {}, useState(value) { const key = index++; if (!(key in state)) state[key] = typeof value === "function" ? value() : value; return [state[key], next => { state[key] = typeof next === "function" ? next(state[key]) : next; }]; } },
    "next/navigation": { useSearchParams: () => new URLSearchParams(), useRouter: () => ({ refresh() {} }) },
    "@/lib/company-workdays": { ...workdays, employeeDayKey: () => "2026-11-24" },
    "@/lib/task-dates": dates,
    "@/lib/approval-filters": approvalFilters,
    "@/lib/review-quality": { MIN_REVIEWED_TASKS: 3 },
  };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const compiled = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), code)(name => dependencies[name] ?? (name.startsWith("@/") || name.startsWith("./") ? () => null : require(name)), compiled, compiled.exports, ...Object.values(globals));
  return () => { index = 0; return compiled.exports.default(props); };
}
function all(tree, predicate) {
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => all(child, predicate))];
}
const text = tree => React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(text).join(" ") : String(tree ?? "");
function change(render, label, value) {
  const field = all(render(), element => element.type === "label" && text(element).trim().startsWith(label))[0];
  const control = all(field, element => element.type === "input" || element.type === "select")[0];
  control.props.onChange({ target: { value, checked: value } });
}
function clear(render) { all(render(), element => element.type === "button" && element.props.children === "Clear filters")[0].props.onClick(); }

test("team work combines search, employee, status and blockers and resets together", () => {
  const task = (id, employee, status, blocked = false) => ({ id, title: `Task ${id}`, description: null, status, startDate: null, dueDate: null, workingDays: null, checklistItems: [], assignee: { id: employee, name: employee, email: `${employee}@example.com` }, assignedBy: null, comments: blocked ? [{ id: "blocker", content: "Blocker reported: waiting" }] : [] });
  const render = component("../app/(workspace)/manager/team-task-controls.tsx", { tasks: [task("1", "A", "ON_HOLD", true), task("2", "B", "IN_PROGRESS"), task("3", "A", "ON_HOLD")] });
  change(render, "Employee", "A"); change(render, "Status", "ON_HOLD"); change(render, "Reported blockers", true);
  assert.equal(all(render(), element => element.type === "article").length, 1);
  assert.ok(text(render()).includes("Task 1"));
  change(render, "Search team work", "no-match");
  assert.equal(all(render(), element => element.type === "article").length, 0);
  clear(render);
  assert.equal(all(render(), element => element.type === "article").length, 3);
});

test("report filters apply to exports and keep employees with the same name separate", async () => {
  const base = { assignee: "Same Name", departmentId: "d", department: "Department", status: "APPROVED", priority: "HIGH", startDate: "Nov 20", deadline: "Nov 21", dueDate: "2026-11-21", workingDays: 2, createdAt: "2026-11-19T20:00:00Z" };
  let blob;
  const render = component("../app/(workspace)/reports/report-downloads.tsx", { tasks: [{ ...base, title: "One", assigneeId: "1" }, { ...base, title: "Two", assigneeId: "2" }, { ...base, title: "Other", assigneeId: "3", departmentId: "other", priority: "LOW" }] }, {
    URL: { createObjectURL(value) { blob = value; return "blob:test"; }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() {} }) }, setTimeout() {},
  });
  change(render, "Department", "d"); change(render, "Priority", "HIGH"); change(render, "Status", "APPROVED");
  change(render, "From", "2026-11-20"); change(render, "To", "2026-11-20");
  const exportCsv = index => all(render(), element => element.type === "button" && element.props.className === "export-excel")[index].props.onClick();
  exportCsv(1);
  assert.equal((await blob.text()).split("\r\n").length, 3);
  change(render, "Employee", "2"); exportCsv(0);
  assert.ok((await blob.text()).includes('"Two"'));
  assert.ok(!(await blob.text()).includes('"One"'));
  change(render, "Filter dates by", "due"); exportCsv(0);
  assert.equal((await blob.text()).split("\r\n").length, 1);
  clear(render); exportCsv(0);
  assert.equal((await blob.text()).split("\r\n").length, 4);
});

test("account filters combine login access, employment and reporting manager before pagination", () => {
  const employee = (id, isBlocked, employmentStatus, managerId) => ({ id, name: id, email: `${id}@example.com`, role: "USER", isBlocked, createdAt: "2026-11-20", lastSeenAt: null, leaveDays: [], profile: { employmentStatus, managerId } });
  const render = component("../app/(workspace)/admin/employee-presence.tsx", { employees: [employee("one", true, "ON_LEAVE", "m"), employee("two", false, "ACTIVE", "m"), employee("three", true, "ON_LEAVE", null)], currentUserId: "admin", today: "2026-11-20", departments: [], managers: [{ id: "m", name: "Manager", email: "m@example.com" }] });
  function filter(label, value) { all(render(), element => element.props["aria-label"] === label)[0].props.onChange({ target: { value } }); }
  filter("Filter by login access", "blocked"); filter("Filter by employment status", "ON_LEAVE"); filter("Filter by reporting manager", "m");
  assert.ok(text(render()).includes("one@example.com"));
  assert.ok(!text(render()).includes("two@example.com"));
  assert.ok(!text(render()).includes("three@example.com"));
  clear(render);
  assert.ok(text(render()).includes("three@example.com"));
});

test("review evidence combines task search, employee and rating without changing its source", () => {
  const review = (id, employeeId, rating) => ({ id, employeeId, employeeName: employeeId, taskTitle: "Monthly report", feedback: "Clear work", reviewerName: "Manager", decision: "APPROVED", rating, createdAt: "2026-11-20T10:00:00Z" });
  const evidence = [review("1", "a", 5), review("2", "b", 5), review("3", "a", 3)];
  const render = component("../app/performance-evidence.tsx", { evidence, isTeam: true });
  change(render, "Employee", "a"); change(render, "Rating", "5"); change(render, "Search evidence", "monthly");
  assert.equal(all(render(), element => element.type === "tbody")[0].props.children.length, 1);
  assert.equal(evidence.length, 3);
  clear(render);
  assert.equal(all(render(), element => element.type === "tbody")[0].props.children.length, 3);
});



test("member tasks retain daily history, filter by work date and open submissions on the same screen", () => {
  const task = (id, day, status = "TODO") => ({ id, title: `Inspection ${id}`, description: "Check equipment", status, priority: "HIGH", startDate: `2026-11-${day}`, dueDate: `2026-11-${day}`, createdAt: `2026-11-${day}T00:00:00Z`, updatedAt: `2026-11-${day}T00:00:00Z`, assigneeId: "employee", recurrenceId: "daily", recurrenceDate: `2026-11-${day}`, assignedBy: { name: "Manager", email: "manager@example.com" }, checklistItems: [{ id: "step", title: "Check equipment", isCompleted: true }], comments: [] });
  const render = component("../app/team-member-tasks.tsx", { tasks: [task("old", "20", "APPROVED"), task("current", "24"), task("leave", "23")], leaveDays: ["2026-11-23"] });
  assert.equal(all(render(), element => element.type === "tbody")[0].props.children.length, 3);
  change(render, "Status", "APPROVED");
  assert.equal(all(render(), element => element.type === "tbody")[0].props.children.length, 1);
  all(render(), element => element.type === "button" && element.props.children === "Inspection old")[0].props.onClick();
  const detail = all(render(), element => element.props["aria-label"] === "Selected task details")[0];
  assert.ok(text(detail).includes("Check equipment"));
  assert.ok(all(detail, element => element.props.taskId === "old").length);
  clear(render);
  change(render, "Work from", "2026-11-23"); change(render, "Work to", "2026-11-23");
  assert.equal(all(render(), element => element.type === "tbody").length, 0);
  clear(render);
  change(render, "Work from", "2026-11-24"); change(render, "Work to", "2026-11-24");
  assert.equal(all(render(), element => element.type === "tbody")[0].props.children.length, 2);
  assert.ok(text(render()).includes("Inspection current"));
});


test("approval actions are enabled without ratings and submit only optional feedback", async () => {
  for (const label of ["Approve", "Request revision", "Reject"]) {
    const requests = [];
    const task = { id: "task", title: "Inspection", description: null, dueDate: "2026-11-20", assignee: { id: "employee", name: "Employee", email: "employee@example.com" }, submission: { id: "submission", notes: null, createdAt: "2026-11-20T10:00:00Z", submitter: "Employee", images: [] } };
    const render = component("../app/(workspace)/reviews/review-queue.tsx", {}, {
      fetch: async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ ok: true }) }; },
    }, [false, [task], {}]);
    assert.equal(all(render(), element => element.type === "select" && element.props.required).length, 0);
    const feedback = all(render(), element => element.type === "textarea")[0];
    assert.ok(!feedback.props.required);
    if (label === "Approve") feedback.props.onChange({ target: { value: "Looks good" } });
    const action = all(render(), element => element.type === "button" && element.props.children === label)[0];
    assert.equal(action.props.disabled, false);
    action.props.onClick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, 1);
    assert.equal(Object.hasOwn(requests[0], "rating"), false);
    assert.equal(requests[0].feedback, label === "Approve" ? "Looks good" : "");
    assert.equal(requests[0].submissionId, "submission");
  }
});


test("the team directory links to profiles and does not embed account management controls", () => {
  const employee = { id: "member", name: "Member", email: "member@example.com", role: "USER", isBlocked: false, lastSeenAt: null, leaveDays: [], profile: null };
  const render = component("../app/(workspace)/admin/employee-presence.tsx", { employees: [employee], currentUserId: "admin", today: "2026-11-20", departments: [], managers: [] });
  const links = all(render(), element => element.props.href === "/performance?employee=member");
  assert.ok(links.some(link => link.props.children === "View profile"));
  assert.equal(all(render(), element => element.props.employeeId || element.props.userId).length, 0);
  assert.equal(all(render(), element => element.type === "form").length, 0);
});

test("profile management scopes every control to the selected account and preserves administrator protections", () => {
  const props = { account: { id: "member", name: "Member", email: "member@example.com", role: "USER", isBlocked: false, avatarUrl: null, profile: null }, currentUserId: "admin", departments: [], managers: [], leaveDays: [], today: "2026-11-20" };
  const render = component("../app/user-profile-management.tsx", props);
  const controls = all(render(), element => element.props.employeeId || element.props.userId);
  assert.equal(controls.length, 5);
  assert.ok(controls.every(control => (control.props.employeeId || control.props.userId) === "member"));
  assert.equal(controls.find(control => control.props.role).props.onDeletedHref, "/admin/employees");
  const otherAdmin = component("../app/user-profile-management.tsx", { ...props, account: { ...props.account, id: "other-admin", role: "ADMIN" } });
  assert.equal(all(otherAdmin(), element => element.props.employeeId).length, 0);
  assert.equal(all(otherAdmin(), element => element.props.userId).length, 1);
  const self = component("../app/user-profile-management.tsx", { ...props, account: { ...props.account, id: "admin", role: "ADMIN" } });
  assert.equal(all(self(), element => element.props.userId).length, 2);
  assert.equal(all(self(), element => element.props.role)[0].props.isCurrentUser, true);
});
