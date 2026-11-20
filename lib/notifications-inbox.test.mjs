import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
function inbox() {
  const hooks = [], pending = [], requests = [], routes = [];
  const listeners = new Map();
  const intervals = new Set();
  let cursor = 0;
  const changed = (previous, next) => !previous || next.some((value, index) => !Object.is(value, previous[index]));
  const state = initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial; return [hooks[index], next => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }]; };
  const eventTarget = prefix => ({
    addEventListener: (name, callback) => { const key = `${prefix}:${name}`; if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(callback); },
    removeEventListener: (name, callback) => listeners.get(`${prefix}:${name}`)?.delete(callback),
    dispatchEvent: event => { listeners.get(`${prefix}:${event.type}`)?.forEach(callback => callback(event)); },
  });
  const window = { ...eventTarget("window"), setInterval: callback => { intervals.add(callback); return callback; }, clearInterval: callback => intervals.delete(callback) };
  const document = { ...eventTarget("document"), visibilityState: "visible" };
  const dependencies = {
    react: { ...React, useState: state, useRef: value => state(() => ({ current: value }))[0], useId: () => "notification-panel",
      useCallback: (callback, deps) => { const index = cursor++; if (changed(hooks[index]?.deps, deps)) hooks[index] = { callback, deps }; return hooks[index].callback; },
      useEffect: (setup, deps) => { const index = cursor++; if (changed(hooks[index]?.deps, deps)) pending.push(() => { hooks[index]?.cleanup?.(); hooks[index] = { deps, cleanup: setup() }; }); },
    },
    "next/navigation": { useRouter: () => ({ push: value => routes.push(value) }) },
    "next/link": () => null,
    "@/app/user-avatar": () => null,
    "@/lib/dismissible-menu": { announceMenuOpened() {}, installMenuDismissal: () => () => {} },
  };
  const code = ts.transpileModule(readFileSync(new URL("../app/notifications-inbox.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  const fetch = (_url, options) => new Promise(resolve => { requests.push({ options, respond: body => resolve({ ok: true, json: async () => body }) }); });
  new Function("require", "module", "exports", "window", "document", "fetch", code)(name => dependencies[name] ?? require(name), compiled, compiled.exports, window, document, fetch);
  const render = () => { cursor = 0; const tree = compiled.exports.default(); while (pending.length) pending.shift()(); return tree; };
  const unmount = () => { hooks.forEach(hook => hook?.cleanup?.()); };
  render();
  return { render, requests, window, document, intervals, routes, unmount };
}
function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) { const result = find(child, predicate); if (result) return result; }
  return null;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const notification = { id: "review", type: "TASK_SUBMITTED", message: "Old admin submission alert", href: "/reviews", readAt: null, createdAt: "2026-11-20T10:00:00Z" };

test("a stale bell request cannot restore admin notifications after a newer access-scoped refresh", async () => {
  const api = inbox();
  assert.equal(api.requests.length, 1);
  api.window.dispatchEvent(new Event("focus"));
  assert.equal(api.requests.length, 2);
  api.requests[1].respond({ ok: true, unreadCount: 0, notifications: [] });
  await tick();
  api.requests[0].respond({ ok: true, unreadCount: 1, notifications: [notification] });
  await tick();
  const bell = find(api.render(), element => element.type === "button" && element.props["aria-controls"] === "notification-panel");
  assert.equal(bell.props["aria-label"], "Notifications");
  bell.props.onClick();
  const tree = api.render();
  assert.equal(find(tree, element => element.props.children === notification.message), null);
  api.unmount();
});

test("the bell refreshes when returning to the tab and removes stale list entries and its unread badge", async () => {
  const api = inbox();
  api.requests[0].respond({ ok: true, unreadCount: 1, notifications: [notification] });
  await tick();
  assert.equal(find(api.render(), element => element.type === "button" && element.props["aria-controls"]).props["aria-label"], "Notifications, 1 unread");
  api.document.dispatchEvent(new Event("visibilitychange"));
  api.requests[1].respond({ ok: true, unreadCount: 0, notifications: [] });
  await tick();
  assert.equal(find(api.render(), element => element.type === "button" && element.props["aria-controls"]).props["aria-label"], "Notifications");
  const count = api.requests.length;
  api.unmount();
  api.window.dispatchEvent(new Event("focus"));
  api.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(api.requests.length, count);
  assert.equal(api.intervals.size, 0);
});
