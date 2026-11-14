import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardGuide, guideStorageKey, hasSeenGuide, placeGuideCard, rememberGuide } from "./dashboard-guide.ts";
import { getWorkspaceNavItems } from "./workspace-navigation.ts";

test("company guides explain the user's available views and review permissions", () => {
  const stepsFor = role => buildDashboardGuide(role, "projects", getWorkspaceNavItems(role));
  const employee = stepsFor("USER"), admin = stepsFor("ADMIN"), manager = stepsFor("MANAGER");
  assert.match(employee.find(step => step.id === "reviews").description, /your manager's feedback/);
  assert.match(admin.find(step => step.id === "reviews").description, /approve it, request changes, or reject it/);
  assert.match(manager.find(step => step.id === "reviews").description, /approve it, request changes, or reject it/);
  assert.ok(!employee.some(step => step.selectors.some(selector => selector.includes("/admin"))));
  assert.ok(!manager.some(step => step.id === "calendar"));
  assert.ok(admin.some(step => step.id === "calendar"));
  for (const steps of [employee, admin, manager]) {
    assert.equal(new Set(steps.map(step => step.id)).size, steps.length);
    assert.equal(steps.at(-1).id, "finish");
    assert.ok(steps.every(step => !Object.hasOwn(step, "href")), "The tour must not navigate away from unsaved work");
  }
});

test("personal guides include daily reports, monthly exports, lists and My Day for every role", () => {
  for (const role of ["USER", "MANAGER", "ADMIN"]) {
    const steps = buildDashboardGuide(role, "personal", getWorkspaceNavItems(role, "personal"));
    for (const id of ["tasks", "my-day", "calendar", "lists", "work-reports", "notifications", "workspaces", "finish"]) assert.ok(steps.some(step => step.id === id));
    assert.match(steps.find(step => step.id === "work-reports").description, /daily report/);
    assert.match(steps.find(step => step.id === "work-reports").description, /Choose a month/);
    assert.ok(!steps.some(step => step.id === "reviews"));
  }
});

test("guide completion belongs to the current account, role, workspace and version", () => {
  const key = guideStorageKey("account-1", "USER", "projects");
  assert.notEqual(key, guideStorageKey("account-2", "USER", "projects"));
  assert.notEqual(key, guideStorageKey("account-1", "ADMIN", "projects"));
  assert.notEqual(key, guideStorageKey("account-1", "USER", "personal"));
  assert.match(key, /:v1:/);
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(hasSeenGuide(storage, key), false);
  storage.setItem(key, "unexpected"); assert.equal(hasSeenGuide(storage, key), false);
  for (const state of ["completed", "skipped"]) { rememberGuide(storage, key, state); assert.equal(hasSeenGuide(storage, key), true); }
});

test("restricted browser storage does not break first-time guides or dismissal", () => {
  const storage = { getItem() { throw Error("Storage blocked"); }, setItem() { throw Error("Storage blocked"); } };
  assert.equal(hasSeenGuide(storage, "guide"), false);
  assert.doesNotThrow(() => rememberGuide(storage, "guide", "completed"));
  assert.equal(hasSeenGuide(null, "guide"), false);
  assert.doesNotThrow(() => rememberGuide(null, "guide", "skipped"));
});

test("tour cards stay inside desktop, phone and short-screen viewports", () => {
  for (const viewport of [{ width: 1920, height: 946 }, { width: 390, height: 900 }, { width: 320, height: 568 }, { width: 667, height: 375 }]) {
    const card = { width: Math.min(380, viewport.width - 32), height: Math.min(300, viewport.height - 32) };
    for (const anchor of [null, { left: 16, top: 90, width: 224, height: 45 }, { left: viewport.width - 40, top: 16, width: 32, height: 32 }, { left: 0, top: viewport.height - 40, width: viewport.width, height: 40 }]) {
      const result = placeGuideCard(anchor, viewport, card);
      assert.ok(result.left >= 16 && result.top >= 16);
      assert.ok(result.left + card.width <= viewport.width - 16);
      assert.ok(result.top + card.height <= viewport.height - 16);
    }
  }
});
