import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { isReviewRating } from "./review-quality.ts";

// Run the real route with isolated auth/database dependencies, without a live DB.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/api/company-tasks/[id]/review/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function fixture({ user = { id: "manager", role: "MANAGER" }, managesAssignee = true, changedBeforeWrite = false } = {}) {
  const savedReviews = [];
  const changes = [];
  const notifications = [];
  const timestamp = new Date("2026-11-18T10:00:00Z");
  const task = { id: "task", title: "Report", status: "SUBMITTED_FOR_REVIEW", assigneeId: "employee", updatedAt: timestamp, submissions: [{ id: "submission", submittedById: "employee" }] };
  const currentTimestamp = changedBeforeWrite ? new Date(timestamp.getTime() + 1) : timestamp;
  const database = {
    task: { findFirst: async () => task },
    teamMembership: { findFirst: async () => managesAssignee ? { id: "membership" } : null },
    $transaction: async run => run({
      task: { updateMany: async ({ where }) => ({ count: !where.updatedAt || where.updatedAt.getTime() === currentTimestamp.getTime() ? 1 : 0 }) },
      taskReview: { create: async ({ data }) => { savedReviews.push(data); } },
      taskStatusHistory: { create: async ({ data }) => { changes.push(data); } },
      notification: { create: async ({ data }) => { notifications.push(data); } },
    }),
  };
  const dependencies = {
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/prisma": { prisma: database },
    "@/services/company-tasks": { COMPANY_TASK_PROJECT_ID: "company" },
    "@/lib/review-quality": { isReviewRating },
  };
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => dependencies[name] ?? require(name), loadedModule, loadedModule.exports);
  const post = async (overrides = {}) => {
    const body = { decision: "APPROVED", rating: 3, feedback: "All agreed requirements met.", submissionId: "submission", ...overrides };
    const response = await loadedModule.exports.POST(new Request("http://localhost/api/company-tasks/task/review", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "task" }) });
    return { status: response.status, body: await response.json() };
  };
  return { post, savedReviews, changes, notifications };
}

test("review API rejects omitted ratings rather than defaulting to full marks", async () => {
  const api = fixture();
  const result = await api.post({ rating: undefined });
  assert.equal(result.status, 400);
  assert.equal(api.savedReviews.length, 0);
});

test("review API requires evidence and a specific submission", async () => {
  const api = fixture();
  assert.equal((await api.post({ feedback: "   " })).status, 400);
  assert.equal((await api.post({ submissionId: undefined })).status, 400);
  assert.equal(api.savedReviews.length, 0);
});

test("a stale review form cannot rate a replacement submission", async () => {
  const api = fixture();
  assert.equal((await api.post({ submissionId: "old-submission" })).status, 409);
  assert.equal(api.savedReviews.length, 0);
  assert.equal(api.notifications.length, 0);
});

test("a concurrent task change prevents stale ratings and downstream writes", async () => {
  const api = fixture({ changedBeforeWrite: true });
  assert.equal((await api.post()).status, 409);
  assert.equal(api.savedReviews.length, 0);
  assert.equal(api.changes.length, 0);
  assert.equal(api.notifications.length, 0);
});

test("only an authorized reviewer can rate another employee's work", async () => {
  const outsideTeam = fixture({ managesAssignee: false });
  assert.equal((await outsideTeam.post()).status, 403);
  assert.equal(outsideTeam.savedReviews.length, 0);
  const selfReview = fixture({ user: { id: "employee", role: "ADMIN" } });
  assert.equal((await selfReview.post()).status, 403);
  assert.equal(selfReview.savedReviews.length, 0);
});

test("a valid review preserves the chosen rating, evidence, submission and audit records", async () => {
  const api = fixture();
  assert.equal((await api.post()).status, 200);
  assert.deepEqual(api.savedReviews, [{ submissionId: "submission", reviewerId: "manager", decision: "APPROVED", rating: 3, feedback: "All agreed requirements met." }]);
  assert.equal(api.changes.length, 1);
  assert.equal(api.notifications.length, 1);
});
