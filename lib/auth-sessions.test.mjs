import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { isDatabaseConnectionError } from "./database-errors.ts";

const require = createRequire(import.meta.url);
const initialNow = Date.parse("2026-11-19T10:00:00Z");
const day = 24 * 60 * 60 * 1000;
const token = "opaque-session-token";
const user = { id: "employee", email: "employee@example.com", name: "Employee", role: "USER", avatar: null, isBlocked: false };

function load(path, dependencies, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), code)(
    name => dependencies[name] ?? require(name), loaded, loaded.exports, ...Object.values(globals),
  );
  return loaded.exports;
}

function fixture({ remaining = 60 * 60 * 1000, blocked = false, missing = false, cookie = token, mutable = true } = {}) {
  const state = {
    now: initialNow,
    session: missing ? null : { id: "session", tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(initialNow + remaining), user: { ...user, isBlocked: blocked } },
    cookie, writes: [], lookups: [], cookies: [], deletes: [], failure: null, beforeWrite: null, beforeDelete: null,
  };
  class ClockDate extends Date {
    constructor(...args) { if (!args.length) super(state.now); else super(...args); }
    static now() { return state.now; }
  }
  const database = {
    session: {
      findUnique: async ({ where }) => {
        state.lookups.push(where);
        if (state.failure === "lookup") throw new Error("Connection terminated unexpectedly");
        return state.session?.tokenHash === where.tokenHash ? structuredClone(state.session) : null;
      },
      updateMany: async ({ where, data }) => {
        state.writes.push({ where, data });
        if (state.failure === "refresh") throw new Error("Connection terminated unexpectedly");
        if (state.failure === "unexpected") throw new Error("Unexpected database failure");
        if (state.beforeWrite) state.beforeWrite();
        const session = state.session;
        if (!session || session.id !== where.id || session.tokenHash !== where.tokenHash ||
          session.expiresAt <= where.expiresAt.gt || session.user.isBlocked !== where.user.isBlocked) return { count: 0 };
        Object.assign(session, data);
        return { count: 1 };
      },
      deleteMany: async ({ where }) => {
        state.deletes.push(where);
        if (state.beforeDelete) state.beforeDelete();
        if (!state.session || (where.expiresAt && state.session.expiresAt > where.expiresAt.lte)) return { count: 0 };
        state.session = null;
        return { count: 1 };
      },
    },
    user: { updateMany: async () => ({ count: 1 }) },
  };
  const dependencies = {
    "next/headers": { cookies: async () => ({
      get: () => state.cookie ? { value: state.cookie } : undefined,
      set: value => {
        assert.ok(mutable, "read-only session lookups cannot mutate cookies");
        state.cookies.push(value);
      },
    }) },
    "@/lib/prisma": { prisma: database },
    "@/lib/database-errors": { isDatabaseConnectionError },
    "@/lib/user-avatar": { userAvatarUrl: () => null },
    "@/lib/user-accounts": {},
  };
  const auth = load("./auth.ts", dependencies, { Date: ClockDate, console: { warn() {} } });
  return { state, auth, database, dependencies };
}

test("renewal extends both the database session and browser cookie to the same seven-day expiry", async () => {
  const { auth, state } = fixture();
  assert.equal((await auth.getCurrentUser({ refreshSession: true })).id, user.id);
  const expected = initialNow + 7 * day;
  assert.equal(state.session.expiresAt.getTime(), expected);
  assert.equal(state.cookies.length, 1);
  const cookie = state.cookies[0];
  assert.equal(cookie.expires.getTime(), expected);
  assert.equal(cookie.name, "ilamed_session");
  assert.equal(cookie.value, token);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.path, "/");
  assert.equal(cookie.secure, process.env.NODE_ENV === "production");
  assert.equal(state.lookups[0].tokenHash, crypto.createHash("sha256").update(token).digest("hex"));
});

test("read-only server renders and direct token lookups authenticate without extending either expiry", async () => {
  const { auth, state } = fixture({ mutable: false });
  const original = state.session.expiresAt.getTime();
  assert.equal((await auth.getCurrentUser()).id, user.id);
  assert.equal((await auth.getUserBySessionToken(token)).id, user.id);
  assert.equal(state.session.expiresAt.getTime(), original);
  assert.equal(state.cookies.length, 0);
  assert.equal(state.writes.length, 0);
});

test("healthy sessions repair cookie expiry without repeated database renewal writes", async () => {
  const { auth, state } = fixture({ remaining: 5 * day });
  const original = state.session.expiresAt.getTime();
  await auth.getCurrentUser({ refreshSession: true });
  assert.equal(state.writes.length, 0);
  assert.equal(state.cookies[0].expires.getTime(), original);
});

test("a lost renewal response is repaired on the next heartbeat without extending the database again", async () => {
  const { auth, state } = fixture();
  await auth.getCurrentUser({ refreshSession: true });
  const expiry = state.session.expiresAt.getTime();
  state.cookies = []; // Simulate the first response not reaching the browser.
  state.now += 30_000;
  await auth.getCurrentUser({ refreshSession: true });
  assert.equal(state.writes.length, 1);
  assert.equal(state.cookies[0].expires.getTime(), expiry);
});

test("regular activity can continue beyond the original cookie expiry", async () => {
  const { auth, state } = fixture({ remaining: 7 * day });
  const original = state.session.expiresAt.getTime();
  state.now += 6.75 * day;
  await auth.getCurrentUser({ refreshSession: true });
  state.now = original + day;
  assert.equal((await auth.getCurrentUser({ refreshSession: true })).id, user.id);
  assert.ok(state.cookies.at(-1).expires.getTime() > state.now);
});

test("missing, invalid, blocked and expired sessions never renew or emit a cookie", async () => {
  for (const options of [{ cookie: null }, { cookie: "invalid" }, { missing: true }, { blocked: true }, { remaining: -1 }, { remaining: 0 }]) {
    const { auth, state } = fixture(options);
    assert.equal(await auth.getCurrentUser({ refreshSession: true }), null);
    assert.equal(state.cookies.length, 0);
    assert.equal(state.writes.length, 0);
    if (options.blocked) assert.deepEqual(state.deletes, [{ userId: user.id }]);
  }
});

test("revocation, blocking or expiry between lookup and renewal cannot revive the session", async () => {
  for (const change of [
    state => { state.session = null; },
    state => { state.session.user.isBlocked = true; },
    state => { state.session.expiresAt = new Date(state.now); },
  ]) {
    const { auth, state } = fixture();
    state.beforeWrite = () => change(state);
    assert.equal(await auth.getCurrentUser({ refreshSession: true }), null);
    assert.equal(state.cookies.length, 0);
  }
});

test("expired-session cleanup does not delete a session already renewed by another request", async () => {
  const { auth, state } = fixture({ remaining: 0 });
  state.beforeDelete = () => { state.session.expiresAt = new Date(state.now + 7 * day); };
  assert.equal(await auth.getCurrentUser({ refreshSession: true }), null);
  assert.ok(state.session);
  assert.equal(state.cookies.length, 0);
  assert.equal((await auth.getCurrentUser({ refreshSession: true })).id, user.id);
});

test("temporary database failures never issue an extended cookie and unexpected failures surface", async () => {
  const { auth, state } = fixture();
  state.failure = "refresh";
  const original = state.session.expiresAt.getTime();
  assert.equal((await auth.getCurrentUser({ refreshSession: true })).id, user.id);
  assert.equal(state.session.expiresAt.getTime(), original);
  assert.equal(state.cookies.length, 0);
  state.failure = "lookup";
  assert.equal(await auth.getCurrentUser({ refreshSession: true }), null);
  state.failure = "unexpected";
  await assert.rejects(auth.getCurrentUser({ refreshSession: true }), /Unexpected database failure/);
});

test("heartbeat and account endpoints renew through mutable route cookie stores", async () => {
  for (const [path, method] of [["../app/api/presence/heartbeat/route.ts", "POST"], ["../app/api/auth/me/route.ts", "GET"]]) {
    const { auth, state, database } = fixture();
    const route = load(path, { "@/lib/auth": auth, "@/lib/prisma": { prisma: database } });
    const response = await route[method]();
    assert.equal(response.status, 200);
    assert.equal(state.cookies.length, 1);
    assert.equal(state.cookies[0].expires.getTime(), state.session.expiresAt.getTime());
  }
});
