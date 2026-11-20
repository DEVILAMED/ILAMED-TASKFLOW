import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as digestHelpers from "./company-task-digest.ts";
import { companyTaskAccessWhere } from "./company-task-access.ts";

const require = createRequire(import.meta.url);
const now = new Date("2026-11-20T03:30:00Z");
const employee = { id: "employee", role: "USER", isBlocked: false, leaveDays: [] };
const task = (id, dueDate, overrides = {}) => ({ id, status: "IN_PROGRESS", assigneeId: "employee", startDate: dueDate, dueDate, submissions: [], deletedAt: null, archivedAt: null, managers: [], ...overrides });

function fixture(users = [employee], tasks = [task("today", "2026-11-20")]) {
  const state = { users: structuredClone(users), tasks: structuredClone(tasks), deliveries: [], notifications: [], failWrite: false, taskReads: 0 };
  const eligible = (user, day) => !user.isBlocked && !["INACTIVE", "ON_LEAVE"].includes(user.employmentStatus) && !user.leaveDays.some(item => item.day.getTime() === day.getTime());
  let transactionQueue = Promise.resolve();
  const database = {
    user: {
      findMany: async ({ where }) => state.users.filter(user => eligible(user, where.leaveDays.none.day) && !state.deliveries.some(item => item.userId === user.id && item.day.getTime() === where.companyDigestDeliveries.none.day.getTime())).slice(0, 100),
      findFirst: async ({ where }) => state.users.find(user => user.id === where.id && eligible(user, where.leaveDays.none.day)) ?? null,
    },
    companyDigestDelivery: { createMany: async ({ data, skipDuplicates }) => {
      assert.equal(skipDuplicates, true);
      const [receipt] = data;
      if (state.deliveries.some(item => item.userId === receipt.userId && item.day.getTime() === receipt.day.getTime())) return { count: 0 };
      state.deliveries.push(receipt); return { count: 1 };
    } },
    task: { findMany: async ({ where }) => {
      state.taskReads++;
      assert.equal(where.deletedAt, null); assert.equal(where.archivedAt, null);
      return state.tasks.filter(task => !task.deletedAt && !task.archivedAt && !where.status.notIn.includes(task.status) && (where.assigneeId ? task.assigneeId === where.assigneeId : where.OR ? task.assigneeId === where.OR[0].assigneeId || task.managers.includes(where.OR[0].assigneeId) : true));
    } },
    notification: { create: async ({ data }) => { if (state.failWrite) throw new Error("Notification storage failed"); state.notifications.push(data); } },
    $transaction: action => {
      const operation = transactionQueue.then(async () => {
        const snapshot = structuredClone({ deliveries: state.deliveries, notifications: state.notifications });
        try { return await action(database); } catch (error) { Object.assign(state, snapshot); throw error; }
      });
      transactionQueue = operation.catch(() => {}); return operation;
    },
  };
  const code = ts.transpileModule(readFileSync(new URL("../services/company-task-reminders.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependencies = { "@/lib/prisma": { prisma: database }, "@/lib/company-task-access": { companyTaskAccessWhere }, "@/lib/company-task-digest": digestHelpers, "@/services/company-tasks": { COMPANY_TASK_PROJECT_ID: "company" } };
  const compiled = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), compiled, compiled.exports);
  return { state, run: (date = now) => compiled.exports.dispatchCompanyTaskDigests(date) };
}

test("digests become eligible at 9 AM India time and skip Sundays", () => {
  assert.equal(digestHelpers.companyDigestDay(new Date("2026-11-20T03:29:59Z")), null);
  assert.equal(digestHelpers.companyDigestDay(now), "2026-11-20");
  assert.equal(digestHelpers.companyDigestDay(new Date("2026-11-22T10:00:00Z")), null);
});

test("one digest combines due today, upcoming working-day deadlines and overdue work", async () => {
  const api = fixture([employee], [task("today", "2026-11-20"), task("tomorrow", "2026-11-21"), task("late", "2026-11-19"), task("approved", "2026-11-19", { status: "APPROVED" }), task("archived", "2026-11-20", { archivedAt: now }), task("deleted", "2026-11-20", { deletedAt: now }), task("other", "2026-11-20", { assigneeId: "other" })]);
  await api.run();
  assert.equal(api.state.notifications.length, 1);
  assert.equal(api.state.notifications[0].type, "COMPANY_TASK_DIGEST");
  for (const value of ["1 due today", "1 due next working day", "1 overdue"]) assert.ok(api.state.notifications[0].message.includes(value));
});

test("only authorized reviewers are reminded about other people's submissions older than 24 hours", async () => {
  const manager = { ...employee, id: "manager", role: "MANAGER" };
  const api = fixture([manager, employee], [task("waiting", null, { status: "SUBMITTED_FOR_REVIEW", managers: ["manager"], submissions: [{ createdAt: "2026-11-19T03:30:00Z" }] }), task("unrelated", null, { assigneeId: "other", status: "SUBMITTED_FOR_REVIEW", submissions: [{ createdAt: "2026-11-18T03:30:00Z" }] }), task("new", null, { status: "SUBMITTED_FOR_REVIEW", managers: ["manager"], submissions: [{ createdAt: "2026-11-20T03:00:00Z" }] })]);
  await api.run();
  assert.equal(api.state.notifications.length, 1);
  assert.equal(api.state.notifications[0].userId, "manager");
  assert.match(api.state.notifications[0].message, /1 submissions waiting over 24 hours/);
  assert.equal(api.state.notifications[0].href, "/reviews?sort=oldest");
});

test("simultaneous workers and repeated sweeps deliver at most once per user per day", async () => {
  const api = fixture();
  await Promise.all([api.run(), api.run()]);
  await api.run();
  assert.equal(api.state.notifications.length, 1);
  assert.equal(api.state.deliveries.length, 1);
  await api.run(new Date("2026-11-21T03:30:00Z"));
  assert.equal(api.state.notifications.length, 2);
});

test("a failed notification write rolls back its delivery receipt so the digest can be retried", async () => {
  const api = fixture(); api.state.failWrite = true;
  await assert.rejects(api.run(), /Notification storage failed/);
  assert.equal(api.state.deliveries.length, 0);
  api.state.failWrite = false; await api.run();
  assert.equal(api.state.notifications.length, 1);
});

test("blocked, inactive and on-leave employees receive no digest, and empty digests are suppressed", async () => {
  const api = fixture([{ ...employee, isBlocked: true }, { ...employee, id: "inactive", employmentStatus: "INACTIVE" }, { ...employee, id: "profile-leave", employmentStatus: "ON_LEAVE" }, { ...employee, id: "leave", leaveDays: [{ day: new Date("2026-11-20T00:00:00Z") }] }]);
  await api.run();
  assert.equal(api.state.notifications.length, 0); assert.equal(api.state.taskReads, 0);
  const empty = fixture([employee], []); await empty.run(); await empty.run();
  assert.equal(empty.state.notifications.length, 0); assert.equal(empty.state.taskReads, 1);
});

test("next working-day reminders skip Sundays and recorded leave, and do not pressure submitted or held work", () => {
  const summary = digestHelpers.companyDigestSummary([task("next", "2026-11-24"), task("submitted", "2026-11-19", { status: "SUBMITTED_FOR_REVIEW" }), task("held", "2026-11-19", { status: "ON_HOLD" })], employee, new Date("2026-11-21T03:30:00Z"), ["2026-11-23"]);
  assert.equal(summary.upcoming, 1); assert.equal(summary.overdue, 0); assert.equal(summary.pendingReviews, 0);
});
