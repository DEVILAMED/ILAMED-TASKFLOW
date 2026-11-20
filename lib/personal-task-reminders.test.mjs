import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as taskAccess from "./company-task-access.ts";
import * as taskDates from "./task-dates.ts";

const require = createRequire(import.meta.url);
const now = new Date("2026-11-19T10:00:00Z");
const earlier = new Date(now.getTime() - 60_000);
const person = (id, isBlocked = false) => ({ id, isBlocked });
const task = (id = "task") => ({
  id, title: "Prepare report", isCompleted: false, reminderAt: earlier, reminderProcessedAt: null,
  list: { owner: person("owner"), memberships: [{ user: person("member") }, { user: person("owner") }, { user: person("blocked", true) }] },
});
const access = userId => ({ OR: [{ ownerId: userId }, { memberships: { some: { userId } } }] });
const canAccess = (item, scope) => {
  const userId = scope.OR[0].ownerId;
  return item.list.owner.id === userId || item.list.memberships.some(member => member.user.id === userId);
};
function load(path, dependencies, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), code)(
    name => dependencies[name] ?? require(name), loaded, loaded.exports, ...Object.values(globals),
  );
  return loaded.exports;
}

function fixture(tasks = [task()]) {
  const state = { tasks: structuredClone(tasks), notifications: [], failWrite: false, beforeClaim: null };
  let transactionQueue = Promise.resolve();
  const notificationMatches = (item, where) => {
    if (where.id && item.id !== where.id) return false;
    if (item.userId !== where.userId || item.type !== where.type) return false;
    if (item.desktopClaimedAt !== null || item.readAt !== null) return false;
    const current = state.tasks.find(task => task.id === item.todoTaskId);
    return current && !current.isCompleted && canAccess(current, where.todoTask.is.list);
  };
  const database = {
    todoTask: {
      findMany: async ({ where }) => structuredClone(state.tasks.filter(item =>
        !item.isCompleted && !item.reminderProcessedAt && item.reminderAt && item.reminderAt <= where.reminderAt.lte &&
        (!where.list || canAccess(item, where.list)),
      ).slice(0, 100)),
      updateMany: async ({ where, data }) => {
        if (state.beforeClaim) { state.beforeClaim(state.tasks); state.beforeClaim = null; }
        const current = state.tasks.find(item => item.id === where.id && !item.isCompleted && !item.reminderProcessedAt &&
          item.reminderAt?.getTime() === where.reminderAt?.getTime());
        if (!current) return { count: 0 };
        Object.assign(current, data);
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }) => structuredClone(state.tasks.find(item => item.id === where.id)),
    },
    notification: {
      createMany: async ({ data, skipDuplicates }) => {
        if (state.failWrite) throw new Error("Notification write failed");
        for (const item of data) {
          const duplicate = state.notifications.some(saved => saved.userId === item.userId && saved.todoTaskId === item.todoTaskId &&
            saved.reminderAt.getTime() === item.reminderAt.getTime());
          if (skipDuplicates && duplicate) continue;
          state.notifications.push({ ...item, id: `notification-${state.notifications.length}`, createdAt: now, readAt: null, desktopClaimedAt: null });
        }
      },
      findMany: async ({ where }) => structuredClone(state.notifications.filter(item => notificationMatches(item, where)).slice(0, 10)),
      updateMany: async ({ where, data }) => {
        const current = state.notifications.find(item => notificationMatches(item, where));
        if (!current) return { count: 0 };
        Object.assign(current, data);
        return { count: 1 };
      },
    },
    $transaction: run => {
      const operation = transactionQueue.then(async () => {
        const snapshot = structuredClone({ tasks: state.tasks, notifications: state.notifications });
        try { return await run(database); }
        catch (error) { Object.assign(state, snapshot); throw error; }
      });
      transactionQueue = operation.catch(() => {});
      return operation;
    },
  };
  const dependencies = { "@/lib/prisma": { prisma: database }, "@/lib/todo-access": { accessibleTodoListWhere: access } };
  const reload = () => load("../services/personal-task-reminders.ts", dependencies);
  return { state, reload, ...reload() };
}

test("due reminders persist for active list participants without duplicates across concurrent sweeps or restarts", async () => {
  const api = fixture([
    task("task with & characters"),
    { ...task("future"), reminderAt: new Date(now.getTime() + 60_000) },
    { ...task("completed"), isCompleted: true },
    { ...task("unset"), reminderAt: null },
  ]);
  await Promise.all([api.dispatchPersonalTaskReminders(undefined, now), api.dispatchPersonalTaskReminders(undefined, now)]);
  await api.reload().dispatchPersonalTaskReminders(undefined, now);
  assert.deepEqual(api.state.notifications.map(item => item.userId).sort(), ["member", "owner"]);
  assert.ok(api.state.notifications.every(item => item.todoTaskId === "task with & characters"));
  assert.equal(api.state.notifications[0].href, "/todos?section=tasks&task=task%20with%20%26%20characters");
  assert.equal(api.state.notifications[0].message, "Reminder: Prepare report");
});

test("failed notification writes roll back the processing marker for a later successful retry", async () => {
  const api = fixture();
  api.state.failWrite = true;
  await assert.rejects(api.dispatchPersonalTaskReminders(undefined, now), /write failed/);
  assert.equal(api.state.tasks[0].reminderProcessedAt, null);
  assert.equal(api.state.notifications.length, 0);
  api.state.failWrite = false;
  await api.dispatchPersonalTaskReminders(undefined, now);
  assert.equal(api.state.notifications.length, 2);
});

test("completion, rescheduling and deletion before the atomic claim prevent stale reminders", async () => {
  for (const change of [
    tasks => { tasks[0].isCompleted = true; },
    tasks => { tasks[0].reminderAt = new Date(now.getTime() + 60_000); },
    tasks => { tasks.splice(0); },
  ]) {
    const api = fixture();
    api.state.beforeClaim = change;
    await api.dispatchPersonalTaskReminders(undefined, now);
    assert.equal(api.state.notifications.length, 0);
  }
});

test("a different reminder time creates a fresh receipt, while restoring an already delivered time does not duplicate it", async () => {
  const api = fixture();
  await api.dispatchPersonalTaskReminders(undefined, now);
  api.state.tasks[0].reminderAt = new Date(earlier.getTime() + 1000);
  api.state.tasks[0].reminderProcessedAt = null;
  await api.dispatchPersonalTaskReminders(undefined, now);
  assert.equal(api.state.notifications.length, 4);
  api.state.tasks[0].reminderAt = earlier;
  api.state.tasks[0].reminderProcessedAt = null;
  await api.dispatchPersonalTaskReminders(undefined, now);
  assert.equal(api.state.notifications.length, 4);
});

test("desktop claims survive reloads and concurrent tabs and remain scoped to the authenticated recipient", async () => {
  const api = fixture();
  await api.dispatchPersonalTaskReminders(undefined, now);
  const results = await Promise.all([api.claimPersonalTaskReminders("owner", now), api.claimPersonalTaskReminders("owner", now)]);
  assert.equal(results.flat().length, 1);
  assert.equal((await api.reload().claimPersonalTaskReminders("owner", now)).length, 0);
  assert.equal((await api.claimPersonalTaskReminders("stranger", now)).length, 0);
  assert.equal((await api.claimPersonalTaskReminders("member", now)).length, 1);
  assert.ok(api.state.notifications.every(item => item.readAt === null), "desktop delivery must not mark in-app reminders read");
});

test("completed tasks, revoked list access and read reminders cannot produce desktop alerts", async () => {
  for (const change of [
    state => { state.tasks[0].isCompleted = true; },
    state => { state.tasks[0].list.memberships = []; },
    state => { state.notifications.forEach(item => { item.readAt = now; }); },
  ]) {
    const api = fixture();
    await api.dispatchPersonalTaskReminders(undefined, now);
    change(api.state);
    assert.equal((await api.claimPersonalTaskReminders("member", now)).length, 0);
  }
});

test("request-time processing cannot discover private tasks belonging to another user", async () => {
  const api = fixture();
  await api.dispatchPersonalTaskReminders("stranger", now);
  assert.equal(api.state.notifications.length, 0);
  await api.dispatchPersonalTaskReminders("member", now);
  assert.equal(api.state.notifications.length, 2);
});

test("the desktop endpoint rejects anonymous calls and uses session identity rather than request ownership", async () => {
  for (const user of [null, { id: "owner" }]) {
    const calls = [];
    const route = load("../app/api/personal-task-reminders/route.ts", {
      "@/lib/auth": { getCurrentUser: async () => user },
      "@/services/personal-task-reminders": {
        dispatchPersonalTaskReminders: async id => { calls.push(id); },
        claimPersonalTaskReminders: async id => { calls.push(id); return []; },
      },
    });
    const response = await route.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ userId: "stranger" }) }));
    assert.equal(response.status, user ? 200 : 401);
    assert.deepEqual(calls, user ? ["owner", "owner"] : []);
  }
});

test("the background worker starts once, avoids overlapping sweeps and retries failures", async () => {
  const callbacks = [];
  let sweeps = 0;
  const service = load("../services/personal-reminder-worker.ts", {
    "@/services/personal-task-reminders": { dispatchPersonalTaskReminders: async () => { sweeps++; throw new Error("offline"); } },
  }, { globalThis: {}, console: { error() {} }, setTimeout: (callback, delay) => {
    assert.equal(delay, 30_000); callbacks.push(callback); return { unref() {} };
  } });
  service.startPersonalReminderWorker(); service.startPersonalReminderWorker();
  assert.equal(callbacks.length, 1);
  await callbacks[0]();
  assert.equal(sweeps, 1);
  assert.equal(callbacks.length, 2);
});

test("task edits rearm changed reminder times and suppress obsolete desktop deliveries atomically", async () => {
  for (const changes of [
    { reminderAt: now.toISOString() }, { reminderAt: null }, { isCompleted: true },
    { reminderAt: earlier.toISOString() }, { title: "New title" },
  ]) {
    const existing = { ...task(), note: null, important: false, repeat: null, listId: "list", myDayEntries: [], steps: [], reminderProcessedAt: now };
    const writes = [];
    let suppressed = 0;
    const database = {
      todoTask: {
        update: async ({ data }) => { writes.push(data); },
        findUniqueOrThrow: async () => existing,
      },
      notification: { updateMany: async ({ where }) => {
        assert.equal(writes.length, 1, "lock/update the task before suppressing notifications");
        assert.equal(where.todoTaskId, existing.id); suppressed++;
      } },
      $transaction: async run => run(database),
    };
    const route = load("../app/api/personal-tasks/[id]/route.ts", {
      "@/lib/auth": { getCurrentUser: async () => ({ id: "owner" }) },
      "@/lib/prisma": { prisma: database },
      "@/lib/todo-access": { accessibleTodoListWhere: access, findAccessibleTodoTask: async () => existing },
    });
    const response = await route.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(changes) }), { params: Promise.resolve({ id: existing.id }) });
    assert.equal(response.status, 200);
    const reminderChanged = Object.hasOwn(changes, "reminderAt") && changes.reminderAt !== earlier.toISOString();
    assert.equal(writes[0].reminderProcessedAt, reminderChanged ? null : undefined);
    assert.equal(suppressed, reminderChanged || changes.isCompleted ? 1 : 0);
  }
});

test("desktop delivery runs outside the personal page and does not repeat after unmount/remount", async () => {
  const api = fixture();
  await api.dispatchPersonalTaskReminders(undefined, now);
  const alerts = [];
  const cleanups = [];
  const callbacks = [];
  const listeners = new Map();
  class BrowserNotification {
    static permission = "granted";
    constructor(title, options) { alerts.push({ title, ...options }); }
  }
  const window = {
    Notification: BrowserNotification,
    setInterval: callback => { callbacks.push(callback); return 1; }, clearInterval() {},
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: event => listeners.delete(event), dispatchEvent() {},
  };
  const component = load("../app/personal-task-reminders.tsx", { react: { useEffect: setup => cleanups.push(setup()) } }, {
    window, document: { addEventListener() {}, removeEventListener() {} }, Notification: BrowserNotification,
    fetch: async () => ({ ok: true, json: async () => ({ reminders: await api.claimPersonalTaskReminders("owner", now) }) }),
  });
  component.default();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].body, "Reminder: Prepare report");
  cleanups[0]();
  component.default();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(alerts.length, 1);
  cleanups[1]();
  assert.equal(listeners.size, 0);
});

test("the ordinary inbox catches up reminders without desktop permission and hides them after list access is revoked", async () => {
  const api = fixture();
  let user = { id: "member", role: "USER" };
  const matches = (item, where) => {
    if (item.userId !== where.userId) return false;
    const current = api.state.tasks.find(task => task.id === item.todoTaskId);
    return where.OR.some(branch => branch.type === item.type && branch.todoTask && canAccess(current, branch.todoTask.is.list));
  };
  const route = load("../app/api/notifications/route.ts", {
    "@/lib/task-dates": taskDates,
    "@/lib/company-task-access": taskAccess,
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/prisma": { prisma: { notification: {
      count: async ({ where }) => api.state.notifications.filter(item => matches(item, where) && !item.readAt).length,
      findMany: async ({ where }) => api.state.notifications.filter(item => matches(item, where)).map(item => ({ ...item, actor: null, task: null })),
    } } },
    "@/services/personal-task-reminders": { dispatchPersonalTaskReminders: id => api.dispatchPersonalTaskReminders(id, now) },
    "@/lib/todo-access": { accessibleTodoListWhere: access },
    "@/project-access": { accessibleProjectWhere: () => ({}), accessibleTaskWhere: () => ({}) },
    "@/services/company-tasks": { COMPANY_TASK_PROJECT_ID: "company" },
    "@/lib/user-avatar": { USER_IDENTITY_SELECT: {}, withAvatarUrl: value => value },
    "@/lib/company-task-links": { companyTaskHref: () => { throw new Error("Personal reminders must retain personal task links"); } },
  });
  const response = await route.GET(new Request("http://localhost/api/notifications"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.unreadCount, 1);
  assert.equal(body.notifications[0].href, "/todos?section=tasks&task=task");
  assert.equal(body.notifications[0].type, "PERSONAL_TASK_REMINDER");
  api.state.tasks[0].list.memberships = [];
  assert.equal((await (await route.GET(new Request("http://localhost/api/notifications"))).json()).notifications.length, 0);
  user = null;
  assert.equal((await route.GET(new Request("http://localhost/api/notifications"))).status, 401);
});
