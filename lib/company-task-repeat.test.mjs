import * as taskEvidence from "./task-evidence.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import React from "react";
import * as repeat from "./company-task-repeat.ts";
import * as workdays from "./company-workdays.ts";
import * as management from "./company-task-management.ts";
import * as workflow from "./company-task-workflow.ts";
import * as access from "./company-task-access.ts";
import * as avatars from "./user-avatar.ts";
import * as images from "./submission-images.ts";
import * as attachmentHelpers from "./submission-attachments.ts";
import * as attachmentPreparation from "./prepare-submission-attachment.ts";
import * as limitedForm from "./limited-form-data.ts";
import * as quality from "./review-quality.ts";

const require = createRequire(import.meta.url);
const dayDate = day => new Date(`${day}T00:00:00Z`);
const dayOf = date => date.toISOString().slice(0, 10);
const admin = { id: "admin", role: "ADMIN", name: "Admin", email: "admin@example.com" };
const employee = { id: "employee", role: "USER", name: "Employee", email: "employee@example.com", isBlocked: false, avatar: null };
function load(path, dependencies, FormDataClass = FormData) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  new Function("require", "module", "exports", "FormData", code)(name => dependencies[name] ?? require(name), compiled, compiled.exports, FormDataClass);
  return compiled.exports;
}

function fixture() {
  const state = { rules: [], tasks: [], checklist: [], history: [], changes: [], notifications: [], submissions: [], reviews: [], leave: ["2026-11-23"], failChecklist: false };
  let actor = admin;
  const returnedTask = task => task ? {
    ...task, assignee: task.assigneeId ? employee : null,
    assignedBy: task.assignedById === admin.id ? admin : task.assignedById === employee.id ? employee : null,
    checklistItems: state.checklist.filter(item => item.taskId === task.id),
    recurrence: state.rules.find(rule => rule.id === task.recurrenceId) ?? null,
    submissions: state.submissions.filter(submission => submission.taskId === task.id).toReversed(),
  } : null;
  const database = {
    companyTaskRecurrence: {
      findMany: async ({ where }) => structuredClone(state.rules.filter(rule => rule.isActive && rule.nextDate <= where.nextDate.lte)),
      create: async ({ data }) => { const rule = { id: `rule-${state.rules.length}`, isActive: true, ...data }; state.rules.push(rule); return { ...rule }; },
      updateMany: async ({ where, data }) => {
        const rule = state.rules.find(rule => rule.id === where.id && rule.isActive && rule.nextDate.getTime() === where.nextDate.getTime());
        if (!rule) return { count: 0 };
        Object.assign(rule, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => { const rule = state.rules.find(rule => rule.id === where.id); Object.assign(rule, data); return rule; },
    },
    employeeLeaveDay: { findMany: async () => state.leave.map(day => ({ day: dayDate(day) })) },
    user: {
      findFirst: async ({ where }) => where.id === employee.id ? employee : null,
      findMany: async ({ where }) => where.role === "ADMIN" ? [{ id: admin.id }] : [],
    },
    teamMembership: { findMany: async () => [], findFirst: async () => null },
    task: {
      create: async ({ data }) => {
        const { checklistItems, ...fields } = data;
        const task = { id: `task-${state.tasks.length}`, recurrenceId: null, recurrenceDate: null, createdAt: dayDate("2026-11-20"), updatedAt: dayDate("2026-11-20"), ...fields };
        state.tasks.push(task);
        for (const item of checklistItems?.create ?? []) state.checklist.push({ id: `item-${state.checklist.length}`, taskId: task.id, isCompleted: false, ...item });
        return returnedTask(task);
      },
      createMany: async ({ data }) => {
        for (const item of data) {
          assert.ok(!state.tasks.some(task => task.recurrenceId === item.recurrenceId && task.recurrenceDate && dayOf(task.recurrenceDate) === dayOf(item.recurrenceDate)), "Only one occurrence per date");
          state.tasks.push({ createdAt: item.startDate, updatedAt: item.startDate, ...item });
        }
      },
      findFirst: async ({ where }) => returnedTask(state.tasks.find(task => task.id === where.id && task.projectId === where.projectId && (!where.assigneeId || task.assigneeId === where.assigneeId) && (!where.status || task.status === where.status))),
      update: async ({ where, data }) => {
        const task = state.tasks.find(task => task.id === where.id);
        if (where.status) assert.equal(task.status, where.status);
        Object.assign(task, data); task.updatedAt = new Date(task.updatedAt.getTime() + 1);
        return returnedTask(task);
      },
      updateMany: async ({ where, data }) => {
        const task = state.tasks.find(task => task.id === where.id && task.status === where.status && task.updatedAt.getTime() === where.updatedAt.getTime());
        if (!task) return { count: 0 };
        Object.assign(task, data);
        return { count: 1 };
      },
    },
    companyTaskChecklistItem: { createMany: async ({ data }) => { if (state.failChecklist) throw new Error("Checklist storage failed"); state.checklist.push(...data); } },
    taskChange: { create: async ({ data }) => state.changes.push(data) },
    taskStatusHistory: { create: async ({ data }) => state.history.push(data), createMany: async ({ data }) => state.history.push(...data) },
    notification: { create: async ({ data }) => state.notifications.push(data), createMany: async ({ data }) => state.notifications.push(...data) },
    taskSubmission: { create: async ({ data }) => { const submission = { id: `submission-${state.submissions.length}`, ...data }; state.submissions.push(submission); return submission; } },
    taskReview: { create: async ({ data }) => state.reviews.push(data) },
    $transaction: async action => {
      const snapshot = structuredClone(state);
      try { return await action(database); } catch (error) { Object.assign(state, snapshot); throw error; }
    },
  };
  const dependencies = {
    "@/lib/task-evidence": taskEvidence,
    "@/lib/prisma": { prisma: database }, "@/lib/auth": { getCurrentUser: async () => actor },
    "@/services/company-tasks": { COMPANY_TASK_PROJECT_ID: "company", ensureCompanyTaskProject: async () => ({ id: "company" }) },
    "@/lib/company-task-repeat": repeat, "@/lib/company-workdays": { ...workdays, employeeDayKey: date => date ? workdays.employeeDayKey(date) : "2026-11-20" },
    "@/lib/company-task-management": management, "@/lib/company-task-workflow": workflow, "@/lib/company-task-access": access,
    "@/lib/user-avatar": avatars, "@/lib/submission-images": images, "@/lib/limited-form-data": limitedForm,
    "@/lib/prepare-submission-image": { prepareSubmissionImage: () => { throw new Error("Unexpected upload"); }, InvalidSubmissionImageError: class extends Error {} },
    "@/lib/review-quality": quality,
    "@/lib/submission-attachments": attachmentHelpers,
    "@/lib/prepare-submission-attachment": attachmentPreparation,
  };
  const generate = load("../services/recurring-company-tasks.ts", dependencies).ensureDailyCompanyTasks;
  dependencies["@/services/recurring-company-tasks"] = { ensureDailyCompanyTasks: generate };
  const createRoute = load("../app/api/company-tasks/route.ts", dependencies);
  const repeatRoute = load("../app/api/company-tasks/[id]/repeat/route.ts", dependencies);
  const updateRoute = load("../app/api/company-tasks/[id]/route.ts", dependencies);
  const reviewRoute = load("../app/api/company-tasks/[id]/review/route.ts", dependencies);
  const context = id => ({ params: Promise.resolve({ id }) });
  const request = (body, method = "PATCH") => new Request("http://localhost", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return {
    state, database, generate, setActor: value => { actor = value; },
    create: (overrides = {}) => createRoute.POST(request({ title: "Daily checks", description: "Inspect equipment", assigneeId: employee.id, priority: "HIGH", startDate: "2026-11-20", dueDate: "2026-11-20", repeat: "DAILY", checklistItems: ["Inspect", "Record findings"], ...overrides }, "POST")),
    repeat: (id, body) => repeatRoute.PATCH(request(body), context(id)),
    update: (id, body) => updateRoute.PATCH(request(body), context(id)),
    review: (id, submissionId) => reviewRoute.POST(request({ decision: "APPROVED", feedback: "Checks completed correctly.", rating: 4, submissionId }, "POST"), context(id)),
  };
}

test("daily repeat validation rejects unsupported frequencies and malformed or inappropriate end dates", () => {
  assert.deepEqual(repeat.parseTaskRepeat({}), { ok: true, daily: false, endDate: null });
  assert.deepEqual(repeat.parseTaskRepeat({ repeat: "DAILY" }), { ok: true, daily: true, endDate: null });
  for (const payload of [{ repeat: "WEEKLY" }, { repeat: true }, { repeat: "NONE", repeatUntil: "2026-11-25" }, { repeat: "DAILY", repeatUntil: "2026-02-30" }, { repeat: "DAILY", repeatUntil: "2026-11-25T00:00:00Z" }]) assert.equal(repeat.parseTaskRepeat(payload).ok, false);
  assert.equal(repeat.firstRepeatWorkday("2026-11-22", null, ["2026-11-23"]), "2026-11-24");
  assert.equal(repeat.firstRepeatWorkday("2026-11-22", "2026-11-23", ["2026-11-23"]), null);
  assert.equal(repeat.nextCalendarDay("2028-02-28"), "2028-02-29");
  assert.equal(repeat.nextCalendarDay("2026-12-31"), "2027-01-01");
});

test("creation saves a daily schedule and the first occurrence atomically, and normal date ranges remain unchanged", async () => {
  const api = fixture();
  const response = await api.create({ repeatUntil: "2026-11-25", assignedById: "fake-admin" });
  assert.equal(response.status, 201);
  const { task } = await response.json();
  assert.equal(task.recurrenceDate.slice(0, 10), "2026-11-20");
  assert.equal(task.assignedBy.id, admin.id);
  assert.equal(api.state.tasks[0].assignedById, admin.id);
  assert.equal(task.recurrence.endDate.slice(0, 10), "2026-11-25");
  assert.equal(api.state.rules.length, 1);
  assert.equal(dayOf(api.state.rules[0].nextDate), "2026-11-21");
  assert.equal(api.state.checklist.length, 2);
  assert.equal((await api.create({ repeat: "NONE", startDate: "2026-11-20", dueDate: "2026-11-25" })).status, 201);
  assert.equal(api.state.rules.length, 1);
  assert.equal(dayOf(api.state.tasks[1].dueDate), "2026-11-25");
  assert.equal(api.state.tasks[1].recurrenceId, null);
  assert.equal(api.state.tasks[1].assignedById, admin.id);
});

test("daily creation skips an initial Sunday and leave, and rejects empty schedules or invalid ranges", async () => {
  const api = fixture();
  assert.equal((await api.create({ startDate: "2026-11-22", dueDate: "2026-11-22" })).status, 201);
  assert.equal(dayOf(api.state.tasks[0].startDate), "2026-11-24");
  for (const override of [
    { startDate: "2026-11-19", dueDate: "2026-11-19" }, { dueDate: "2026-11-21" },
    { repeatUntil: "2026-11-19" }, { startDate: "2026-11-22", dueDate: "2026-11-22", repeatUntil: "2026-11-23" },
  ]) assert.equal((await api.create(override)).status, 400);
  assert.equal(api.state.rules.length, 1);
});

test("employees can create their own tasks with automatic assignment and authenticated authorship", async () => {
  const api = fixture();
  api.setActor(employee);
  for (const assigneeId of [undefined, null, "", employee.id]) {
    const response = await api.create({ repeat: "NONE", assigneeId, assignedById: admin.id, status: "APPROVED" });
    assert.equal(response.status, 201);
    const task = api.state.tasks.at(-1);
    assert.equal(task.assigneeId, employee.id);
    assert.equal(task.assignedById, employee.id);
    assert.equal(task.status, "TODO");
    assert.equal(api.state.history.at(-1).actorId, employee.id);
  }
  assert.equal(api.state.rules.length, 0);
  assert.equal(api.state.checklist.length, 8);
  assert.equal((await api.update("task-0", { status: "IN_PROGRESS" })).status, 200);
  assert.equal((await api.update("task-0", { status: "SUBMITTED_FOR_REVIEW", notes: "My completed work" })).status, 200);
  assert.equal(api.state.submissions[0].submittedById, employee.id);
});

test("employees cannot create tasks for anyone else or bypass validation and active account checks", async () => {
  const api = fixture();
  api.setActor(employee);
  for (const assigneeId of [admin.id, "other-employee"]) {
    assert.equal((await api.create({ assigneeId })).status, 403);
  }
  assert.equal((await api.create({ title: "a" })).status, 400);
  assert.equal((await api.create({ dueDate: "2026-11-19" })).status, 400);
  api.database.user.findFirst = async () => null;
  assert.equal((await api.create()).status, 400);
  api.setActor(null);
  assert.equal((await api.create()).status, 401);
  assert.equal(api.state.tasks.length, 0);
  assert.equal(api.state.rules.length, 0);
  assert.equal(api.state.notifications.length, 0);
});

test("employees can create recurring tasks that remain assigned to themselves", async () => {
  const api = fixture();
  api.setActor(employee);
  assert.equal((await api.create({ assigneeId: undefined })).status, 201);
  assert.equal(api.state.rules[0].assigneeId, employee.id);
  assert.equal(api.state.rules[0].createdById, employee.id);
  await api.generate(new Date("2026-11-21T10:00:00Z"));
  assert.equal(api.state.tasks.length, 2);
  for (const task of api.state.tasks) {
    assert.equal(task.assigneeId, employee.id);
    assert.equal(task.assignedById, employee.id);
  }
});

test("employees can edit their own task details without changing assignment or review authority", async () => {
  const api = fixture();
  api.setActor(employee);
  await api.create({ repeat: "NONE" });
  const changes = { title: "Updated personal work", description: "New scope", startDate: "2026-11-21", dueDate: "2026-11-25", priority: "LOW" };
  const response = await api.update("task-0", changes);
  assert.equal(response.status, 200);
  const { task } = await response.json();
  assert.equal(task.title, changes.title);
  assert.equal(task.description, changes.description);
  assert.equal(task.priority, "LOW");
  assert.equal(task.startDate.slice(0, 10), changes.startDate);
  assert.equal(task.dueDate.slice(0, 10), changes.dueDate);
  assert.equal(task.assignedBy.id, employee.id);
  assert.equal(api.state.history.length, 1);
  for (const body of [{ assigneeId: admin.id }, { assigneeId: null }, { assignedById: employee.id }, { title: "Forged approval", status: "APPROVED" }]) {
    assert.equal((await api.update("task-0", body)).status >= 400, true);
  }
  assert.equal((await api.update("task-0", { startDate: "2026-11-26" })).status, 400);
  assert.equal(api.state.tasks[0].title, changes.title);
  assert.equal(api.state.tasks[0].status, "TODO");
  assert.equal(api.state.tasks[0].assigneeId, employee.id);
});

test("original creators keep edit rights after admin reassignment back to them", async () => {
  const api = fixture();
  api.setActor(employee);
  await api.create({ repeat: "NONE" });
  assert.equal(api.state.tasks[0].createdById, employee.id);
  api.setActor(admin);
  assert.equal((await api.update("task-0", { assigneeId: null })).status, 200);
  assert.equal((await api.update("task-0", { assigneeId: employee.id })).status, 200);
  assert.equal(api.state.tasks[0].assignedById, admin.id);
  assert.equal(api.state.tasks[0].createdById, employee.id);
  api.setActor(employee);
  assert.equal((await api.update("task-0", { title: "Still my task" })).status, 200);
  assert.equal((await api.update("task-0", { createdById: admin.id })).status, 400);
});

test("submissions preserve instructions and checklist even after subsequent edits", async () => {
  const api = fixture();
  api.setActor(employee);
  await api.create({ repeat: "NONE" });
  await api.update("task-0", { status: "IN_PROGRESS" });
  await api.update("task-0", { status: "SUBMITTED_FOR_REVIEW", notes: "Evidence for original scope" });
  const saved = structuredClone(api.state.submissions[0].detailsSnapshot);
  assert.equal(saved.title, "Daily checks");
  assert.equal(saved.description, "Inspect equipment");
  assert.equal(saved.checklist.length, 2);
  assert.equal((await api.update("task-0", { title: "New instructions", description: "Different deliverables" })).status, 200);
  assert.deepEqual(api.state.submissions[0].detailsSnapshot, saved);
  assert.equal(api.state.changes.at(-1).action, "DETAILS_EDITED");
  assert.equal(api.state.changes.at(-1).before.title, "Daily checks");
  assert.equal(api.state.changes.at(-1).after.title, "New instructions");
});

test("failed audit writes roll back task edits, and archived tasks reject edits", async () => {
  const api = fixture();
  api.setActor(employee);
  await api.create({ repeat: "NONE" });
  api.database.taskChange.create = async () => { throw new Error("Audit unavailable"); };
  await assert.rejects(api.update("task-0", { title: "Unsaved change" }), /Audit unavailable/);
  assert.equal(api.state.tasks[0].title, "Daily checks");
  api.state.tasks[0].archivedAt = new Date();
  assert.equal((await api.update("task-0", { title: "Archived edit" })).status, 409);
  assert.equal((await api.update("task-0", { status: "IN_PROGRESS" })).status, 409);
});

test("employees cannot edit details of admin-created tasks even alongside allowed progress changes", async () => {
  const api = fixture();
  await api.create({ repeat: "NONE" });
  api.setActor(employee);
  for (const changes of [{ title: "Changed" }, { description: "Changed" }, { startDate: "2026-11-21" }, { dueDate: "2026-11-25" }, { priority: "LOW" }]) {
    assert.equal((await api.update("task-0", changes)).status, 403);
    assert.equal((await api.update("task-0", { ...changes, status: "IN_PROGRESS" })).status, 403);
  }
  assert.equal(api.state.tasks[0].title, "Daily checks");
  assert.equal(api.state.tasks[0].status, "TODO");
  assert.equal((await api.update("task-0", { status: "IN_PROGRESS" })).status, 200);
  api.setActor(admin);
  assert.equal((await api.update("task-0", { title: "Admin edit" })).status, 200);
});

test("missed working days are generated independently with fresh checklists while yesterday still awaits review", async () => {
  const api = fixture();
  await api.create();
  api.state.tasks[0].status = "SUBMITTED_FOR_REVIEW";
  api.state.checklist[0].isCompleted = true;
  await api.generate(new Date("2026-11-24T10:00:00Z"));
  assert.deepEqual(api.state.tasks.map(task => dayOf(task.recurrenceDate)), ["2026-11-20", "2026-11-21", "2026-11-24"]);
  assert.equal(api.state.tasks[0].status, "SUBMITTED_FOR_REVIEW");
  for (const task of api.state.tasks.slice(1)) {
    assert.equal(task.status, "TODO");
    assert.equal(task.priority, "HIGH");
    assert.equal(task.title, "Daily checks");
    assert.equal(task.assigneeId, employee.id);
    assert.equal(task.assignedById, admin.id);
    assert.deepEqual(api.state.checklist.filter(item => item.taskId === task.id).map(item => item.isCompleted), [false, false]);
  }
  assert.equal(api.state.notifications.length, 3);
  assert.deepEqual(api.state.notifications.map(item => item.type), ["TASK_ASSIGNED", "TASK_COMMENTED", "TASK_COMMENTED"]);
  assert.equal(dayOf(api.state.rules[0].nextDate), "2026-11-25");
});

test("concurrent refreshes and later refreshes cannot duplicate occurrences or assignment notifications", async () => {
  const api = fixture();
  await api.create();
  await Promise.all([api.generate(new Date("2026-11-24T10:00:00Z")), api.generate(new Date("2026-11-24T10:00:00Z"))]);
  await api.generate(new Date("2026-11-24T18:29:59Z"));
  assert.equal(api.state.tasks.length, 3);
  assert.equal(api.state.notifications.length, 3);
});

test("generation follows India midnight and stops at the inclusive last repeat date", async () => {
  const api = fixture();
  await api.create({ repeatUntil: "2026-11-21" });
  await api.generate(new Date("2026-11-20T18:29:59Z"));
  assert.equal(api.state.tasks.length, 1);
  await api.generate(new Date("2026-11-20T18:30:00Z"));
  assert.equal(api.state.tasks.length, 2);
  assert.equal(api.state.rules[0].isActive, false);
  await api.generate(new Date("2026-11-30T10:00:00Z"));
  assert.equal(api.state.tasks.length, 2);
});

test("a failed occurrence transaction rolls back the cursor, tasks and notifications for a safe retry", async () => {
  const api = fixture();
  await api.create();
  api.state.failChecklist = true;
  await assert.rejects(api.generate(new Date("2026-11-24T10:00:00Z")), /Checklist storage failed/);
  assert.equal(dayOf(api.state.rules[0].nextDate), "2026-11-21");
  assert.equal(api.state.tasks.length, 1);
  assert.equal(api.state.notifications.length, 1);
  api.state.failChecklist = false;
  await api.generate(new Date("2026-11-24T10:00:00Z"));
  assert.equal(api.state.tasks.length, 3);
});

test("existing tasks can repeat from the next working day and stopping preserves all earlier work", async () => {
  const api = fixture();
  await api.create({ repeat: "NONE" });
  api.state.tasks[0].status = "APPROVED";
  api.state.submissions.push({ id: "old-submission", taskId: "task-0", submittedById: employee.id });
  assert.equal((await api.repeat("task-0", { repeat: "DAILY" })).status, 200);
  assert.equal(dayOf(api.state.rules[0].startDate), "2026-11-21");
  assert.equal(api.state.tasks[0].status, "APPROVED");
  await api.generate(new Date("2026-11-24T10:00:00Z"));
  assert.equal((await api.repeat(api.state.tasks[1].id, { repeat: "NONE" })).status, 200);
  await api.generate(new Date("2026-12-01T10:00:00Z"));
  assert.equal(api.state.tasks.length, 3);
  assert.equal(api.state.submissions[0].id, "old-submission");
});

test("employees cannot change repeat schedules and managers cannot change tasks outside their teams", async () => {
  const api = fixture();
  await api.create();
  api.setActor(employee);
  assert.equal((await api.repeat("task-0", { repeat: "NONE" })).status, 403);
  assert.equal((await api.create({ assigneeId: "other-employee" })).status, 403);
  api.setActor({ ...admin, role: "MANAGER" });
  api.database.task.findFirst = async () => null;
  assert.equal((await api.repeat("task-0", { repeat: "NONE" })).status, 404);
  assert.equal((await api.create()).status, 403);
  api.setActor(null);
  assert.equal((await api.repeat("task-0", { repeat: "NONE" })).status, 401);
  assert.equal(api.state.rules[0].isActive, true);
});

test("separate daily submissions and reviews never overwrite another day's pending work", async () => {
  const api = fixture();
  await api.create();
  api.setActor(employee);
  assert.equal((await api.update("task-0", { status: "IN_PROGRESS" })).status, 200);
  assert.equal((await api.update("task-0", { status: "SUBMITTED_FOR_REVIEW", notes: "Friday results" })).status, 200);
  await api.generate(new Date("2026-11-21T10:00:00Z"));
  const saturday = api.state.tasks[1];
  assert.equal((await api.update(saturday.id, { status: "IN_PROGRESS" })).status, 200);
  assert.equal((await api.update(saturday.id, { status: "SUBMITTED_FOR_REVIEW", notes: "Saturday results" })).status, 200);
  assert.equal(api.state.submissions.length, 2);
  assert.notEqual(api.state.submissions[0].taskId, api.state.submissions[1].taskId);
  api.setActor(admin);
  assert.equal((await api.review("task-0", "submission-0")).status, 200);
  assert.equal(api.state.tasks[0].status, "APPROVED");
  assert.equal(saturday.status, "SUBMITTED_FOR_REVIEW");
  assert.equal(api.state.reviews[0].submissionId, "submission-0");
  assert.deepEqual(api.state.submissions.map(submission => submission.notes), ["Friday results", "Saturday results"]);
});

test("the task form sends a daily schedule with one-day deadlines and an optional last date", async (t) => {
  const state = [];
  let cursor = 0, refreshes = 0, sent;
  const hooks = { ...React, useRef: () => ({ current: null }), useEffect: () => {}, useState: initial => {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = value; }];
  } };
  t.mock.method(globalThis, "fetch", async (url, request) => {
    sent = { url, body: JSON.parse(request.body) };
    return { ok: true, json: async () => ({ ok: true }) };
  });
  const Dialog = load("../app/new-company-task-dialog.tsx", {
    react: hooks, "@/lib/employee-departments": { resolveDepartmentFilter: () => "ALL", matchesDepartment: () => true },
    "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }), useSearchParams: () => new URLSearchParams() },
  }, class { constructor(values) { this.values = values; } get(key) { return this.values[key] ?? null; } }).default;
  function find(tree, predicate) {
    if (!React.isValidElement(tree)) return null;
    if (predicate(tree)) return tree;
    for (const child of React.Children.toArray(tree.props.children)) {
      const result = find(child, predicate);
      if (result) return result;
    }
    return null;
  }
  const render = () => { cursor = 0; return Dialog({ employees: [employee] }); };
  let tree = render();
  find(tree, element => element.type === "select" && element.props.name === "repeat").props.onChange({ target: { value: "DAILY" } });
  tree = render();
  find(tree, element => element.type === "input" && element.props.name === "startDate").props.onChange({ target: { value: "2026-11-20" } });
  find(tree, element => element.type === "input" && element.props.type === "date" && !element.props.name).props.onChange({ target: { value: "2026-11-30" } });
  tree = render();
  find(tree, element => element.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: { title: "Daily task", assigneeId: employee.id, priority: "MEDIUM", description: "Daily instructions", checklist: "First step\nSecond step" } });
  await new Promise(setImmediate);
  assert.equal(sent.url, "/api/company-tasks");
  assert.equal(sent.body.repeat, "DAILY");
  assert.equal(sent.body.startDate, "2026-11-20");
  assert.equal(sent.body.dueDate, "2026-11-20");
  assert.equal(sent.body.repeatUntil, "2026-11-30");
  assert.deepEqual(sent.body.checklistItems, ["First step", "Second step"]);
  assert.equal(refreshes, 1);

  cursor = 0;
  tree = Dialog({ employees: [], selfAssigneeId: employee.id });
  assert.equal(find(tree, element => element.type === "select" && element.props.name === "assigneeId"), null);
  assert.equal(find(tree, element => element.type === "button" && element.props.type === "submit").props.disabled, false);
  find(tree, element => element.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: { title: "My task", assigneeId: "other-employee", priority: "MEDIUM" } });
  await new Promise(setImmediate);
  assert.equal(sent.body.assigneeId, employee.id);
  assert.equal(refreshes, 2);
});

test("the self-created task editor hides assignment and deletion and saves only edited details", async () => {
  const state = [];
  let cursor = 0, saved;
  const hooks = { ...React, useState: initial => {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = value; }];
  } };
  const Editor = load("../app/company-task-editor.tsx", { react: hooks }, class {
    constructor(values) { this.values = values; }
    get(key) { return this.values[key] ?? null; }
  }).default;
  const elements = tree => !React.isValidElement(tree) ? [] : [tree, ...React.Children.toArray(tree.props.children).flatMap(elements)];
  const task = { id: "own-task", title: "My work", description: "Scope", startDate: "2026-11-20", dueDate: "2026-11-21", priority: "MEDIUM", status: "TODO", assignee: employee };
  const render = () => { cursor = 0; return elements(Editor({ task, employees: [], pending: false, allowAssignment: false, onSave: async changes => { saved = changes; return true; } })); };
  let tree = render();
  assert.equal(tree.some(element => element.type === "button" && element.props.children === "Delete task"), false);
  tree.find(element => element.type === "button" && element.props.children === "Edit task").props.onClick();
  tree = render();
  assert.equal(tree.some(element => element.props.name === "assigneeId"), false);
  tree.find(element => element.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: { title: "Updated work", description: "Scope", priority: "MEDIUM" } });
  await new Promise(setImmediate);
  assert.deepEqual(saved, { title: "Updated work" });
});
