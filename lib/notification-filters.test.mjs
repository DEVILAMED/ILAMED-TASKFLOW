import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as taskDates from "./task-dates.ts";

const require = createRequire(import.meta.url);
function fixture(items = []) {
  let user = { id: "viewer", role: "USER" };
  const calls = [];
  const matches = (item, where) => item.userId === where.userId
    && (!where.type || item.type === where.type)
    && (where.readAt === undefined || (where.readAt === null ? item.readAt === null : item.readAt !== null))
    && (!where.createdAt?.gte || item.createdAt >= where.createdAt.gte)
    && (!where.createdAt?.lt || item.createdAt < where.createdAt.lt);
  const dependencies = {
    "@/lib/task-dates": taskDates,
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/prisma": { prisma: { notification: {
      count: async ({ where }) => items.filter(item => matches(item, where)).length,
      findMany: async options => {
        calls.push(options);
        return items.filter(item => matches(item, options.where)).sort((a,b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)).slice(options.skip, options.skip + options.take);
      },
    } } },
    "@/services/personal-task-reminders": { dispatchPersonalTaskReminders: async () => {} },
    "@/lib/todo-access": { accessibleTodoListWhere: id => ({ ownerId: id }) },
    "@/project-access": { accessibleProjectWhere: id => ({ ownerId: id }), accessibleTaskWhere: id => ({ assigneeId: id }) },
    "@/services/company-tasks": { COMPANY_TASK_PROJECT_ID: "company" },
    "@/lib/user-avatar": { USER_IDENTITY_SELECT: {}, withAvatarUrl: value => value },
    "@/lib/company-task-links": { companyTaskHref: () => "/company-tasks" },
  };
  const code = ts.transpileModule(readFileSync(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), compiled, compiled.exports);
  return { calls, logout: () => { user = null; }, get: query => compiled.exports.GET(new Request(`http://localhost/api/notifications?${query}`)) };
}
const item = (id, time, changes = {}) => ({ id, type: "TASK_APPROVED", userId: "viewer", projectId: "company", taskId: null, actor: null, task: null, createdAt: new Date(time), readAt: null, ...changes });

test("notification filters use inclusive India dates and preserve the access scope and global unread count", async () => {
  const api = fixture([
    item("before", "2026-11-19T18:29:59.999Z"),
    item("start", "2026-11-19T18:30:00Z"),
    item("end", "2026-11-20T18:29:59.999Z"),
    item("after", "2026-11-20T18:30:00Z"),
    item("other-type", "2026-11-20T10:00:00Z", { type: "TASK_ASSIGNED" }),
    item("read", "2026-11-20T10:00:00Z", { readAt: new Date() }),
    item("other-user", "2026-11-20T10:00:00Z", { userId: "someone-else" }),
  ]);
  const response = await api.get("from=2026-11-20&to=2026-11-20&type=TASK_APPROVED&read=unread");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.notifications.map(item => item.id), ["end", "start"]);
  assert.equal(body.unreadCount, 5);
  const where = api.calls[0].where;
  assert.equal(where.userId, "viewer");
  assert.equal(where.OR.length, 3);
  assert.equal(where.OR[0].project.is.ownerId, "viewer");
  assert.equal(body.hasMore, false);
  const read = await (await api.get("read=read")).json();
  assert.deepEqual(read.notifications.map(item => item.id), ["read"]);
});

test("notification pagination reaches older filtered entries without returning other types", async () => {
  const api = fixture(Array.from({ length: 102 }, (_, index) => item(String(index).padStart(3, "0"), "2026-11-20T10:00:00Z", { type: index === 101 ? "TASK_ASSIGNED" : "TASK_APPROVED" })));
  const first = await (await api.get("type=TASK_APPROVED")).json();
  const second = await (await api.get("type=TASK_APPROVED&page=2")).json();
  const last = await (await api.get("type=TASK_APPROVED&page=3")).json();
  assert.equal(first.notifications.length, 50);
  assert.equal(first.hasMore, true);
  assert.equal(second.notifications.length, 50);
  assert.equal(last.notifications.length, 1);
  assert.equal(last.hasMore, false);
  assert.equal(new Set([...first.notifications, ...second.notifications, ...last.notifications].map(item => item.id)).size, 101);
});

test("notification filters reject invalid dates, reversed ranges, invalid types, and unauthorized requests", async () => {
  const api = fixture();
  for (const query of ["from=2026-02-30", "to=invalid", "from=2026-11-21&to=2026-11-20", "type=unknown"]) {
    assert.equal((await api.get(query)).status, 400);
  }
  assert.equal(api.calls.length, 0);
  api.logout();
  assert.equal((await api.get("")).status, 401);
});
