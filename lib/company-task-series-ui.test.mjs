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

const require = createRequire(import.meta.url);
const History = () => null;
function board(params) {
  const source = readFileSync(new URL("../app/(workspace)/company-tasks/company-task-board.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const dependencies = {
    react: { ...React, useState: value => [value, () => {}], useEffect: () => {}, useRef: value => ({ current: value }) },
    "next/navigation": { useSearchParams: () => params, useRouter: () => ({ refresh() {} }) },
    "@/lib/company-task-series": series, "@/lib/company-workdays": { ...workdays, employeeDayKey: () => "2026-11-24" },
    "@/lib/task-dates": dates, "@/lib/task-progress": progress,
    "@/app/task-submission-history": History,
  };
  const compiled = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? (name.startsWith("@/app/") ? () => null : require(name)), compiled, compiled.exports);
  const tasks = ["20", "21", "24"].map(day => ({
    id: `day-${day}`, title: "Daily inspection", description: null, priority: "MEDIUM", status: day === "20" ? "APPROVED" : "TODO",
    recurrenceId: "repeat", recurrenceDate: `2026-11-${day}`, recurrence: { isActive: true, startDate: "2026-11-20", endDate: "2026-11-30" },
    startDate: `2026-11-${day}`, dueDate: `2026-11-${day}`, createdAt: `2026-11-${day}T00:00:00Z`, updatedAt: `2026-11-${day}T00:00:00Z`,
    assignee: { id: "employee", name: "Employee", email: "employee@example.com" }, assignedBy: null, checklistItems: [],
  }));
  return compiled.exports.default({ isAdmin: false, initialTasks: tasks, employees: [], leaveByEmployee: {}, employeeId: "employee" });
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
  const tree = board(new URLSearchParams("task=day-20"));
  const tbody = find(tree, element => element.type === "tbody");
  assert.equal(React.Children.count(tbody.props.children), 1);
  const picker = find(tree, element => element.type === "select" && element.props.value === "day-20");
  assert.deepEqual(React.Children.toArray(picker.props.children).map(option => option.props.value), ["day-24", "day-21", "day-20"]);
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
    const tree = board(new URLSearchParams());
    const tbody = find(tree, element => element.type === "tbody");
    assert.equal(React.Children.count(tbody.props.children), 1);
    find(tbody, element => element.type === "button" && element.props.children === "Daily inspection").props.onClick();
    assert.equal(destination.searchParams.get("task"), "day-24");
    const detail = board(destination.searchParams);
    assert.equal(find(detail, element => element.type === History).props.taskId, "day-24");
    const picker = find(detail, element => element.type === "select" && element.props.value === "day-24");
    assert.ok(React.Children.toArray(picker.props.children).some(option => option.props.value === "day-21"));
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
    const tree = board(new URLSearchParams("task=day-20"));
    find(tree, element => element.type === "select" && element.props.value === "day-20").props.onChange({ target: { value: "day-24" } });
    assert.equal(destination.searchParams.get("task"), "day-24");
    const next = board(destination.searchParams);
    assert.equal(find(next, element => element.type === History).props.taskId, "day-24");
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
});
