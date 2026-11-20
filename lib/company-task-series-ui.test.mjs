import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import ts from "typescript";
import * as series from "./company-task-series.ts";
import * as workdays from "./company-workdays.ts";
import * as dates from "./task-dates.ts";
import * as progress from "./task-progress.ts";
import * as management from "./company-task-management.ts";

const require = createRequire(import.meta.url);
const History = () => null;
const Editor = () => null;
const Lifecycle = () => null;
function board(params, detailTaskId, navigate = () => {}, options = {}) {
  const source = readFileSync(new URL("../app/(workspace)/company-tasks/company-task-board.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const dependencies = {
    react: { ...React, useState: value => [value, () => {}], useEffect: () => {}, useRef: value => ({ current: value }) },
    "next/navigation": { useSearchParams: () => params, useRouter: () => ({ refresh() {}, push: navigate }) },
    "@/lib/company-task-management": management,
    "@/lib/company-task-series": series, "@/lib/company-workdays": { ...workdays, employeeDayKey: () => "2026-11-24" },
    "@/lib/task-dates": dates, "@/lib/task-progress": progress,
    "@/app/task-submission-history": History,
    "@/app/company-task-editor": Editor,
    "@/app/task-lifecycle-button": Lifecycle,
  };
  const compiled = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? (name.startsWith("@/app/") ? () => null : require(name)), compiled, compiled.exports);
  const tasks = ["20", "21", "24"].map(day => ({
    id: `day-${day}`, title: "Daily inspection", description: null, priority: "MEDIUM", status: day === "20" ? "APPROVED" : "TODO",
    recurrenceId: "repeat", recurrenceDate: `2026-11-${day}`, recurrence: { isActive: true, startDate: "2026-11-20", endDate: "2026-11-30" },
    startDate: `2026-11-${day}`, dueDate: `2026-11-${day}`, createdAt: `2026-11-${day}T00:00:00Z`, updatedAt: `2026-11-${day}T00:00:00Z`,
    assignee: { id: "employee", name: "Employee", email: "employee@example.com" }, assignedBy: null, checklistItems: [],
    ...options.taskOverrides,
  }));
  return compiled.exports.default({ isAdmin: false, initialTasks: tasks, employees: [], leaveByEmployee: {}, employeeId: "employee", detailTaskId, ...options.props });
}
function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

test("the task list has one row for a repeat while historical daily entries remain accessible", () => {
  const list = board(new URLSearchParams());
  const tbody = find(list, element => element.type === "tbody");
  assert.equal(React.Children.count(tbody.props.children), 1);
  const tree = board(new URLSearchParams(), "day-20");
  assert.equal(find(tree, element => element.type === "dialog"), null);
  assert.equal(find(tree, element => element.type === "tbody"), null);
  assert.ok(find(tree, element => element.type === "h1" && element.props.children === "Daily inspection"));
  const picker = find(tree, element => element.type === "input" && element.props.type === "date" && element.props.list === "task-work-dates");
  assert.equal(picker.props.value, "2026-11-20");
  assert.equal(picker.props.min, "2026-11-20");
  assert.equal(picker.props.max, "2026-11-24");
  const dates = find(tree, element => element.type === "datalist");
  assert.deepEqual(React.Children.toArray(dates.props.children).map(option => option.props.value), ["2026-11-20", "2026-11-21", "2026-11-24"]);
  assert.equal(find(tree, element => element.type === History).props.taskId, "day-20");
});

test("the default list opens today's daily work even when an earlier day is unfinished", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let destination;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { href: "http://localhost/company-tasks" },
    history: { replaceState: (_state, _title, url) => { destination = url; } },
  } });
  try {
    const tree = board(new URLSearchParams(), undefined, href => { destination = new URL(href, "http://localhost"); });
    const tbody = find(tree, element => element.type === "tbody");
    assert.equal(React.Children.count(tbody.props.children), 1);
    find(tbody, element => element.type === "button" && element.props.children === "Daily inspection").props.onClick();
    assert.equal(destination.pathname, "/company-tasks/day-24");
    assert.equal(destination.searchParams.get("returnTo"), "/company-tasks");
    const detail = board(destination.searchParams, "day-24");
    assert.equal(find(detail, element => element.type === History).props.taskId, "day-24");
    const picker = find(detail, element => element.type === "input" && element.props.type === "date" && element.props.list === "task-work-dates");
    assert.equal(picker.props.value, "2026-11-24");
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
});

test("selecting another work date opens its own submission and review history", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let destination;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { href: "http://localhost/company-tasks?task=day-20" },
    history: { replaceState: (_state, _title, url) => { destination = url; } },
  } });
  try {
    const tree = board(new URLSearchParams(), "day-20", href => { destination = new URL(href, "http://localhost"); });
    const picker = find(tree, element => element.type === "input" && element.props.type === "date" && element.props.list === "task-work-dates");
    picker.props.onChange({ target: { value: "" } });
    assert.equal(destination, undefined);
    picker.props.onChange({ target: { value: "2026-11-22" } });
    assert.equal(destination, undefined);
    picker.props.onChange({ target: { value: "2026-11-20" } });
    assert.equal(destination, undefined);
    picker.props.onChange({ target: { value: "2026-11-24" } });
    assert.equal(destination.pathname, "/company-tasks/day-24");
    const next = board(destination.searchParams, "day-24");
    assert.equal(find(next, element => element.type === History).props.taskId, "day-24");
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
});


test("work date ranges select matching daily work before grouping", () => {
  const tree = board(new URLSearchParams("from=2026-11-20&to=2026-11-20"));
  const tbody = find(tree, element => element.type === "tbody");
  assert.equal(React.Children.count(tbody.props.children), 1);
  assert.ok(find(tbody, element => element.type === "span" && element.props.children === "Approved"));
  const empty = board(new URLSearchParams("from=2026-11-22&to=2026-11-22"));
  assert.equal(find(empty, element => element.type === "tbody"), null);
  const invalid = board(new URLSearchParams("from=2026-11-24&to=2026-11-20"));
  assert.ok(find(invalid, element => element.props.role === "alert"));
});

test("employee calendar keeps filters and reset available", () => {
  const tree = board(new URLSearchParams("view=calendar&q=inspection"));
  assert.ok(find(tree, element => element.props["aria-label"] === "Search tasks"));
  assert.ok(find(tree, element => element.type === "button" && element.props.children === "Clear filters"));
});

test("the task screen uses permanent authorship to expose self-editing after reassignment", () => {
  const own = board(new URLSearchParams(), "day-20", undefined, { taskOverrides: { createdById: "employee", assignedBy: { id: "admin", name: "Admin", email: "admin@example.com" } } });
  assert.ok(find(own, element => element.type === Editor));
  const assigned = board(new URLSearchParams(), "day-20", undefined, { taskOverrides: { createdById: "admin", assignedBy: { id: "employee", name: "Employee", email: "employee@example.com" } } });
  assert.equal(find(assigned, element => element.type === Editor), null);
});

test("archived task screens expose unarchive to administrators while keeping progress and comments read-only", () => {
  const archived = board(new URLSearchParams(), "day-20", undefined, { taskOverrides: { createdById: "employee", archivedAt: "2026-11-20T00:00:00Z" }, props: { isAdmin: true } });
  assert.equal(find(archived, element => element.type === Editor), null);
  assert.equal(find(archived, element => element.props["aria-label"] === "Progress update"), null);
  assert.equal(find(archived, element => element.type === Lifecycle).props.action, "UNARCHIVE");
  assert.ok(find(archived, element => element.type === History));
});
