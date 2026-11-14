import assert from "node:assert/strict";
import test from "node:test";
import { getActiveWorkspaceNavHref, getWorkspaceNavItems } from "./workspace-navigation.ts";

test("visiting company pages does not change a role's menu labels, links, or order", () => {
  for (const role of ["ADMIN", "MANAGER", "USER"]) {
    const menu = getWorkspaceNavItems(role).map(({ href, label, icon }) => ({ href, label, icon }));
    for (const route of ["/dashboard", "/admin/overview", "/admin", "/reviews", "/reports", "/admin/employees", "/profile", "/departments", "/manager", "/company-tasks", "/performance", "/notifications"]) {
      getActiveWorkspaceNavHref(role, route, "", "");
      assert.deepEqual(getWorkspaceNavItems(role), menu, `${role} on ${route}`);
    }
  }
});

test("calendar view highlights Calendar without treating other task filters as a different tab", () => {
  assert.equal(getActiveWorkspaceNavHref("ADMIN", "/admin", "view=calendar", ""), "/admin?view=calendar");
  assert.equal(getActiveWorkspaceNavHref("ADMIN", "/admin", "view=calendar&employee=one", ""), "/admin?view=calendar");
  for (const search of ["", "assign=1", "view=board", "focus=OVERDUE", "task=123"]) {
    assert.equal(getActiveWorkspaceNavHref("ADMIN", "/admin", search, ""), "/admin");
  }
});

test("Dashboard and Team Performance have independent views in the shared workspace", () => {
  assert.equal(getActiveWorkspaceNavHref("ADMIN", "/admin/overview", "", ""), "/admin/overview");
  assert.equal(getActiveWorkspaceNavHref("ADMIN", "/performance", "", ""), "/performance");
  assert.equal(getActiveWorkspaceNavHref("ADMIN", "/admin/overview", "", "#employee-performance-title"), "/admin/overview");
  assert.equal(getActiveWorkspaceNavHref("ADMIN", "/admin/overview", "", "#other-section"), "/admin/overview");
});

test("nested team pages keep Team active and profile pages do not highlight an unrelated tab", () => {
  assert.equal(getActiveWorkspaceNavHref("ADMIN", "/admin/employees/person-1", "", ""), "/admin/employees");
  assert.equal(getActiveWorkspaceNavHref("ADMIN", "/departments", "", ""), "/admin/employees");
  assert.equal(getActiveWorkspaceNavHref("ADMIN", "/admin/employees-archive", "", ""), undefined);
  assert.equal(getActiveWorkspaceNavHref("ADMIN", "/profile", "", ""), undefined);
});

test("review navigation is available consistently to reviewers without exposing admin tabs to employees", () => {
  for (const role of ["ADMIN", "MANAGER"]) {
    assert.ok(getWorkspaceNavItems(role).some((item) => item.href === "/reviews"));
    assert.equal(getActiveWorkspaceNavHref(role, "/reviews", "task=123", ""), "/reviews");
  }
  assert.ok(getWorkspaceNavItems("USER").every((item) => !item.href.startsWith("/admin")));
  assert.ok(getWorkspaceNavItems("USER").some(item=>item.href==="/reviews"&&item.label==="Approvals"));
  assert.ok(getWorkspaceNavItems("MANAGER").every((item) => !item.href.startsWith("/admin")));
  assert.equal(getActiveWorkspaceNavHref("MANAGER", "/reports", "", ""), "/reports");
});

test("user tabs keep Tasks, Calendar, Dashboard, and My Performance distinct", () => {
  assert.equal(getActiveWorkspaceNavHref("USER","/dashboard","",""),"/dashboard");
  assert.equal(getActiveWorkspaceNavHref("USER","/company-tasks","view=calendar&day=2026-11-14",""),"/company-tasks?view=calendar");
  assert.equal(getActiveWorkspaceNavHref("USER","/company-tasks","status=APPROVED",""),"/company-tasks");
  assert.equal(getActiveWorkspaceNavHref("USER","/performance","",""),"/performance");
  assert.equal(getActiveWorkspaceNavHref("USER","/notifications","",""),"/notifications");
});

test("personal tabs remain stable for every role while filters only change the active view", () => {
  for (const role of ["USER", "MANAGER", "ADMIN"]) {
    const menu = getWorkspaceNavItems(role, "personal");
    assert.deepEqual(menu.map(item => item.label), ["Dashboard", "Tasks", "My Day", "Important", "Calendar", "Lists", "Work Reports"]);
    for (const section of ["tasks", "my-day", "important", "calendar", "lists", "reports"]) {
      assert.equal(getActiveWorkspaceNavHref(role, "/todos", `section=${section}&list=one&status=completed&task=two`, ""), `/todos?section=${section}`);
      assert.strictEqual(getWorkspaceNavItems(role, "personal"), menu);
    }
    assert.equal(getActiveWorkspaceNavHref(role, "/todos", "", ""), "/todos");
    assert.equal(getActiveWorkspaceNavHref(role, "/todos", "section=unknown", ""), "/todos");
  }
});
