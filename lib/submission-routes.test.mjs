import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import sharp from "sharp";
import * as access from "./company-task-access.ts";
import * as imageHelpers from "./submission-images.ts";
import * as limitedForm from "./limited-form-data.ts";
import * as imagePreparation from "./prepare-submission-image.ts";
import * as workflow from "./company-task-workflow.ts";
import * as management from "./company-task-management.ts";

const require = createRequire(import.meta.url);
const projectId = "company-task-tracker";
const owner = { id: "employee", role: "USER", name: "Employee", email: "employee@example.com" };
const task = { id: "task", projectId, title: "Finish work", assigneeId: owner.id, status: "IN_PROGRESS", startDate: null, dueDate: null };
const context = { params: Promise.resolve({ id: task.id, submissionId: "submission", imageId: "image" }) };

// Exercise the real route handlers with authentication and database I/O replaced.
// Native TypeScript tests cannot otherwise resolve Next's application aliases.
async function route(path, user, prisma) {
  const source = await readFile(new URL(`../app/api/company-tasks/${path}/route.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const dependencies = {
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/prisma": { prisma },
    "@/services/company-tasks": { COMPANY_TASK_PROJECT_ID: projectId },
    "@/lib/company-task-access": access,
    "@/lib/submission-images": imageHelpers,
    "@/lib/limited-form-data": limitedForm,
    "@/lib/prepare-submission-image": imagePreparation,
    "@/lib/company-task-workflow": workflow,
    "@/lib/company-task-management": management,
  };
  const compiled = { exports: {} };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: (name) => dependencies[name] ?? require(name), Request, Response, File, FormData, Uint8Array });
  return compiled.exports;
}

function matchesTask(where, fixture = task) {
  if (where.id && where.id !== fixture.id) return false;
  if (where.projectId && where.projectId !== fixture.projectId) return false;
  if (where.assigneeId && where.assigneeId !== fixture.assigneeId) return false;
  if (where.OR && !where.OR.some((clause) => matchesTask(clause, fixture))) return false;
  if (where.assignee) {
    const membership = where.assignee.teamMemberships.some.team.memberships.some;
    if (membership.userId !== "responsible-manager" || membership.role !== "MANAGER") return false;
  }
  return true;
}

function upload(files = [], extras = []) {
  const form = new FormData();
  form.set("status", "SUBMITTED_FOR_REVIEW");
  form.set("notes", "Completed the checklist");
  for (const file of files) form.append("images", file);
  for (const [key, value] of extras) form.append(key, value);
  return new Request("http://localhost/api/company-tasks/task", { method: "PATCH", body: form });
}

function submissionDatabase(fixture = task) {
  const saved = [];
  let updates = 0;
  const prisma = {
    task: {
      findFirst: async ({ where }) => matchesTask(where, fixture) ? fixture : null,
      update: async ({ data }) => { updates++; return { ...fixture, ...data }; },
    },
    taskStatusHistory: { create: async () => ({}) },
    taskSubmission: { create: async ({ data }) => { saved.push(data); return { id: "submission" }; } },
    teamMembership: { findMany: async () => [] },
    $transaction: async (callback) => callback(prisma),
  };
  return { prisma, saved, updates: () => updates };
}

test("notes-only JSON submissions remain supported and create no images", async () => {
  const db = submissionDatabase();
  const { PATCH } = await route("[id]", owner, db.prisma);
  const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "SUBMITTED_FOR_REVIEW", notes: "Finished" }) }), context);
  assert.equal(response.status, 200);
  assert.equal(db.saved.length, 1);
  assert.equal(db.saved[0].notes, "Finished");
  assert.equal(db.saved[0].images, undefined);
});

test("valid multipart submission saves normalized images in the status-change transaction", async () => {
  const db = submissionDatabase();
  const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: "white" } }).png().toBuffer();
  const { PATCH } = await route("[id]", owner, db.prisma);
  const response = await PATCH(upload([new File([png], "proof.png", { type: "image/png" })]), context);
  assert.equal(response.status, 200);
  assert.equal(db.updates(), 1);
  assert.equal(db.saved.length, 1);
  const image = db.saved[0].images.create[0];
  assert.equal(image.mimeType, "image/webp");
  assert.equal((await sharp(image.data).metadata()).format, "webp");
  assert.equal(image.width, 20);
});

test("unauthorized users and invalid task states cannot initiate an image submission", async () => {
  for (const [user, fixture, expected] of [
    [null, task, 401],
    [{ id: "admin", role: "ADMIN" }, task, 403],
    [{ id: "other", role: "USER" }, task, 404],
    [{ id: "responsible-manager", role: "MANAGER" }, task, 404],
    [owner, { ...task, status: "SUBMITTED_FOR_REVIEW" }, 409],
    [owner, { ...task, status: "TODO" }, 409],
    [owner, { ...task, status: "APPROVED" }, 409],
  ]) {
    const db = submissionDatabase(fixture);
    const { PATCH } = await route("[id]", user, db.prisma);
    assert.equal((await PATCH(upload(), context)).status, expected);
    assert.equal(db.updates(), 0);
    assert.equal(db.saved.length, 0);
  }
});

test("bad files and forged multipart fields never change task status or create a submission", async () => {
  for (const request of [
    upload([new File(["not an image"], "proof.png", { type: "image/png" })]),
    upload(Array.from({ length: 6 }, () => new File(["a"], "proof.png", { type: "image/png" }))),
    upload([], [["assigneeId", "other"]]),
    upload([], [["status", "APPROVED"]]),
    upload([], [["images", "a URL is not an uploaded image"]]),
  ]) {
    const db = submissionDatabase();
    const { PATCH } = await route("[id]", owner, db.prisma);
    assert.equal((await PATCH(request, context)).status, 400);
    assert.equal(db.updates(), 0);
    assert.equal(db.saved.length, 0);
  }
});

test("oversized multipart requests return 413 without changing the task", async () => {
  const db = submissionDatabase();
  const { PATCH } = await route("[id]", owner, db.prisma);
  const request = upload();
  request.headers.set("content-length", String(imageHelpers.MAX_SUBMISSION_BODY_BYTES + 1));
  assert.equal((await PATCH(request, context)).status, 413);
  assert.equal(db.updates(), 0);
});

test("assignment and status are rechecked after upload parsing", async () => {
  for (const changed of [{ ...task, assigneeId: "other" }, { ...task, status: "ON_HOLD" }]) {
    const db = submissionDatabase();
    db.prisma.$transaction = async (callback) => callback({ ...db.prisma, task: { ...db.prisma.task, findFirst: async ({ where }) => matchesTask(where, changed) ? changed : null } });
    const { PATCH } = await route("[id]", owner, db.prisma);
    assert.ok([404, 409].includes((await PATCH(upload(), context)).status));
    assert.equal(db.updates(), 0);
    assert.equal(db.saved.length, 0);
  }
});

test("private image reads allow the assignee, administrators, and responsible managers", async () => {
  const image = { data: new Uint8Array([1, 2, 3]), mimeType: "image/webp", size: 3 };
  for (const [user, expected] of [
    [owner, 200], [{ id: "admin", role: "ADMIN" }, 200],
    [{ id: "responsible-manager", role: "MANAGER" }, 200],
    [{ id: "other", role: "USER" }, 404], [{ id: "other-manager", role: "MANAGER" }, 404], [null, 401],
  ]) {
    const prisma = { taskSubmissionImage: { findFirst: async ({ where }) => (
      where.id === "image" && where.submissionId === "submission" && matchesTask(where.submission.task) ? image : null
    ) } };
    const { GET } = await route("[id]/submissions/[submissionId]/images/[imageId]", user, prisma);
    const response = await GET(new Request("http://localhost"), context);
    assert.equal(response.status, expected);
    if (expected === 200) {
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("content-type"), "image/webp");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), image.data);
    }
  }
});

test("image links cannot cross task or submission boundaries, including for administrators", async () => {
  const prisma = { taskSubmissionImage: { findFirst: async ({ where }) => (
    where.id === "image" && where.submissionId === "submission" && matchesTask(where.submission.task) ? { data: new Uint8Array([1]), mimeType: "image/webp", size: 1 } : null
  ) } };
  const { GET } = await route("[id]/submissions/[submissionId]/images/[imageId]", { id: "admin", role: "ADMIN" }, prisma);
  for (const override of [{ id: "different-task" }, { submissionId: "different-submission" }, { imageId: "different-image" }]) {
    const params = Promise.resolve({ id: "task", submissionId: "submission", imageId: "image", ...override });
    assert.equal((await GET(new Request("http://localhost"), { params })).status, 404);
  }
});

test("submission history uses the same private task access and returns metadata without bytes", async () => {
  for (const [user, expected] of [[owner, 200], [{ id: "admin", role: "ADMIN" }, 200], [{ id: "responsible-manager", role: "MANAGER" }, 200], [{ id: "other", role: "USER" }, 404], [null, 401]]) {
    const prisma = { task: { findFirst: async ({ where, select }) => {
      assert.equal(select.submissions.select.images.select.data, undefined);
      if (!matchesTask(where)) return null;
      return { submissions: [{ id: "submission", notes: "Complete", createdAt: new Date(), submittedBy: owner, images: [{ id: "image", fileName: "proof.webp", size: 1, width: 1, height: 1 }] }] };
    } } };
    const { GET } = await route("[id]/submissions", user, prisma);
    const response = await GET(new Request("http://localhost"), context);
    assert.equal(response.status, expected);
    if (expected === 200) {
      const body = await response.json();
      assert.equal(body.submissions[0].images[0].url, imageHelpers.submissionImageUrl("task", "submission", "image"));
      assert.equal(body.submissions[0].images[0].data, undefined);
    }
  }
});

test("the review queue includes private image links without selecting image bytes", async () => {
  const prisma = { task: { findMany: async ({ select }) => {
    assert.equal(select.submissions.select.images.select.data, undefined);
    return [{ ...task, description: null, assignee: owner, submissions: [{
      id: "submission", notes: "Finished", createdAt: new Date(), submittedBy: owner,
      images: [{ id: "image", fileName: "proof.webp", size: 1, width: 1, height: 1 }],
    }] }];
  } } };
  const { GET } = await route("review-queue", { id: "admin", role: "ADMIN" }, prisma);
  const response = await GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.tasks[0].submission.images[0].url, imageHelpers.submissionImageUrl("task", "submission", "image"));
  assert.equal(body.tasks[0].submissions, undefined);
});
