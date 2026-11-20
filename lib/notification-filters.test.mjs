import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as taskAccess from "./company-task-access.ts";
import * as taskDates from "./task-dates.ts";

const require = createRequire(import.meta.url);
function matches(value, where) {
  if (value == null) return false;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return condition.some(branch => matches(value, branch));
    if (key === "AND") return (Array.isArray(condition) ? condition : [condition]).every(branch => matches(value, branch));
    if (key === "NOT") return !(Array.isArray(condition) ? condition : [condition]).some(branch => matches(value, branch));
    const current = value[key];
    if (condition === null || typeof condition !== "object" || condition instanceof Date) return (current ?? null) === condition;
    if ("is" in condition) return matches(current, condition.is);
    if ("some" in condition) return (current ?? []).some(item => matches(item, condition.some));
    if ("not" in condition) return current !== condition.not;
    if ("in" in condition) return condition.in.includes(current);
    if ("gte" in condition || "lt" in condition) return (!condition.gte || current >= condition.gte) && (!condition.lt || current < condition.lt);
    return matches(current, condition);
  });
}
function fixture(items = [], role = "USER") {
  let user = { id: "viewer", role };
  const calls = [];
  const dependencies = {
    "@/lib/task-dates": taskDates,
    "@/lib/company-task-access": taskAccess,
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/prisma": { prisma: { notification: {
      updateMany: async ({ where, data }) => { const visible = items.filter(item => matches(item, where)); visible.forEach(item => Object.assign(item, data)); return { count: visible.length }; },
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
  return { calls, changeRole: role => { user.role = role; }, patch: body => compiled.exports.PATCH(new Request("http://localhost/api/notifications", { method: "PATCH", body: JSON.stringify(body) })), logout: () => { user = null; }, get: query => compiled.exports.GET(new Request(`http://localhost/api/notifications?${query}`)) };
}
const item = (id, time, changes = {}) => ({ id, type: "TASK_APPROVED", userId: "viewer", projectId: "company", taskId: "task", actor: null, project: { ownerId: "viewer" }, task: { id: "task", deletedAt: null, projectId: "company", assigneeId: "viewer" }, createdAt: new Date(time), readAt: null, ...changes });

test("daily digests are private to their recipient and support read tracking and type filtering", async () => {
  const digest = item("digest", "2026-11-20T03:30:00Z", { type: "COMPANY_TASK_DIGEST", projectId: null, taskId: null, project: null, task: null, href: "/company-tasks?focus=ACTIVE" });
  const api = fixture([digest, { ...digest, id: "other-digest", userId: "other-user" }]);
  const body = await (await api.get("type=COMPANY_TASK_DIGEST")).json();
  assert.deepEqual(body.notifications.map(item => item.id), ["digest"]);
  assert.equal(body.unreadCount, 1);
  assert.equal((await api.patch({ notificationId: "digest" })).status, 200);
  assert.equal((await (await api.get("")).json()).unreadCount, 0);
});

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
  assert.equal(where.OR.length, 4);
  assert.equal(where.OR[1].project.is.ownerId, "viewer");
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


test("demotion removes management notifications from both history and the bell unread count", async () => {
  const time = "2026-11-20T10:00:00Z";
  const othersTask = { id: "other-task", projectId: "company", assigneeId: "other" };
  const items = [
    item("review-alert", time, { type: "TASK_SUBMITTED", task: othersTask }),
    item("blocker-alert", time, { type: "TASK_COMMENTED", task: othersTask }),
    item("own-assignment", time, { type: "TASK_ASSIGNED" }),
    item("own-feedback", time, { type: "TASK_APPROVED" }),
    item("own-submission", time, { type: "TASK_SUBMITTED" }),
  ];
  const api = fixture(items, "ADMIN");
  const before = await (await api.get("")).json();
  assert.equal(before.notifications.length, 5);
  assert.equal(before.unreadCount, 5);
  api.changeRole("USER");
  const response = await api.get("");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const after = await response.json();
  assert.deepEqual(after.notifications.map(item => item.id).sort(), ["own-assignment", "own-feedback"]);
  assert.equal(after.unreadCount, 2);
  const filtered = await (await api.get("type=TASK_SUBMITTED")).json();
  assert.equal(filtered.notifications.length, 0);
  assert.equal(filtered.unreadCount, 2);
  assert.equal(items.length, 5, "Historical notifications are retained without being exposed");
  await api.patch({ markAllRead: true });
  assert.equal(items.find(item => item.id === "review-alert").readAt, null);
  assert.ok(items.find(item => item.id === "own-assignment").readAt);
  assert.equal((await (await api.get("")).json()).unreadCount, 0);
});

test("managers only see company alerts for their own work and teams they currently manage", async () => {
  const time = "2026-11-20T10:00:00Z";
  const inTeam = { id: "team-task", projectId: "company", assigneeId: "member", assignee: { teamMemberships: [{ team: { memberships: [{ userId: "viewer", role: "MANAGER" }] } }] } };
  const items = [
    item("team", time, { type: "TASK_SUBMITTED", task: inTeam }),
    item("outside", time, { type: "TASK_SUBMITTED", task: { id: "outside", projectId: "company", assigneeId: "stranger" } }),
    item("own", time),
  ];
  const api = fixture(items, "MANAGER");
  assert.deepEqual((await (await api.get("")).json()).notifications.map(item => item.id).sort(), ["own", "team"]);
  inTeam.assignee.teamMemberships = [];
  const after = await (await api.get("")).json();
  assert.deepEqual(after.notifications.map(item => item.id), ["own"]);
  assert.equal(after.unreadCount, 1);
});

test("personal reminders, accessible project alerts, and legitimate unassignment notices remain visible", async () => {
  const time = "2026-11-20T10:00:00Z";
  const api = fixture([
    item("unassigned", time, { type: "TASK_UNASSIGNED", task: { id: "task", deletedAt: null, projectId: "company", assigneeId: "other" } }),
    item("reminder", time, { type: "PERSONAL_TASK_REMINDER", projectId: null, taskId: null, task: null, project: null, todoTask: { list: { ownerId: "viewer" } } }),
    item("project", time, { projectId: "project", task: { assigneeId: "viewer" } }),
  ]);
  const body = await (await api.get("")).json();
  assert.equal(body.notifications.length, 3);
  assert.equal(body.unreadCount, 3);
});
