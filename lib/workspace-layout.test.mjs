import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("company tabs share one persistent shell instead of rendering a shell in each page", async () => {
  const group = new URL("../app/(workspace)/", import.meta.url);
  const layout = await readFile(new URL("layout.tsx", group), "utf8");
  const root = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(root, /<html\b/);
  assert.doesNotMatch(layout, /<(html|body)\b/);
  assert.match(layout, /<WorkspaceShell\b/);
  assert.match(layout, /if \(!user\) redirect\("\/login"\)/);
  for (const route of ["dashboard", "admin", "admin/overview", "admin/employees", "reviews", "reports", "manager", "company-tasks", "departments", "profile", "performance", "notifications", "todos"]) {
    const page = await readFile(new URL(`${route}/page.tsx`, group), "utf8");
    assert.doesNotMatch(page, /<WorkspaceShell\b/, `${route} must update inside the shared layout`);
  }
  const loading = await readFile(new URL("loading.tsx", group), "utf8");
  assert.match(loading, /workspace-view-loading/);
  assert.doesNotMatch(loading, /min-h-screen|<WorkspaceShell\b/);
});
