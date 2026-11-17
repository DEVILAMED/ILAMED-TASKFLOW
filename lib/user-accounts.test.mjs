import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.ts";
import { isStrongPassword, parseAccountUpdate, updateManagedAccount } from "./user-accounts.ts";

const administrator = { id: "admin-1", role: "ADMIN" };

function accountStore(overrides = {}) {
  const state = {
    account: { id: "employee-1", name: "Employee", email: "employee@example.com", role: "USER", password: "old-hash", ...overrides },
    sessions: [{ userId: "employee-1" }, { userId: "employee-1" }, { userId: "employee-2" }],
    writes: [],
  };
  const transaction = {
    user: {
      async findUnique({ where }) {
        return state.account?.id === where.id ? { ...state.account } : null;
      },
      async update({ where, data, select }) {
        assert.equal(where.id, "employee-1");
        assert.deepEqual(where.role, { not: "ADMIN" });
        state.writes.push({ ...data });
        Object.assign(state.account, data);
        return Object.fromEntries(Object.keys(select).map((key) => [key, state.account[key]]));
      },
    },
    session: {
      async deleteMany({ where }) {
        state.sessions = state.sessions.filter((session) => session.userId !== where.userId);
      },
    },
  };
  return { state, transaction };
}

test("account edits normalize names and emails without altering password characters", () => {
  const result = parseAccountUpdate({ name: "  Jane Doe  ", email: " JANE@Example.COM ", password: " A-Strong-Password42! " });
  assert.deepEqual(result, { ok: true, data: { name: "Jane Doe", email: "jane@example.com", password: " A-Strong-Password42! " } });
  assert.deepEqual(parseAccountUpdate({ email: "new@example.com" }), { ok: true, data: { email: "new@example.com" } });
  assert.deepEqual(parseAccountUpdate({ name: "Jane" }), { ok: true, data: { name: "Jane" } });
});

test("account edits reject mass assignment, invalid details, and weak passwords", () => {
  for (const payload of [
    {}, { name: "" }, { name: "a" }, { name: "x".repeat(101) }, { name: null },
    { email: "not-an-email" }, { email: 42 }, { email: "a".repeat(250) + "@example.com" },
    { password: "" }, { password: "short" }, { password: "alllowercase42!" },
    { password: "ALLUPPERCASE42!" }, { password: "NoNumbersHere!" }, { password: "NoSymbolsHere42" },
    { password: "A1!" + "x".repeat(126) }, { password: null },
    { name: "Jane", role: "ADMIN" }, { name: "Jane", isBlocked: false },
    { email: "jane@example.com", id: "other-user" }, { passwordHash: "hash" },
  ]) {
    assert.equal(parseAccountUpdate(payload).ok, false, `Unexpectedly accepted ${Object.keys(payload).join(", ")}`);
  }
  assert.equal(isStrongPassword("Valid-Password42"), true);
});

test("only administrators can edit another employee's account", async () => {
  for (const actor of [null, { id: "user-1", role: "USER" }, { id: "manager-1", role: "MANAGER" }]) {
    const { state, transaction } = accountStore();
    const result = await updateManagedAccount(transaction, actor, "employee-1", { name: "Changed" });
    assert.equal(result.ok, false);
    assert.equal(result.status, actor ? 403 : 401);
    assert.equal(state.account.name, "Employee");
    assert.equal(state.writes.length, 0);
    assert.equal(state.sessions.length, 3);
  }
});

test("administrator accounts, self edits, and missing accounts remain protected", async () => {
  const { state, transaction } = accountStore({ role: "ADMIN" });
  const protectedAdmin = await updateManagedAccount(transaction, administrator, "employee-1", { name: "Changed" });
  assert.equal(protectedAdmin.status, 404);
  const selfEdit = await updateManagedAccount(transaction, administrator, administrator.id, { name: "Changed" });
  assert.equal(selfEdit.status, 400);
  const missing = await updateManagedAccount(transaction, administrator, "missing", { name: "Changed" });
  assert.equal(missing.status, 404);
  assert.equal(state.writes.length, 0);
});

test("name edits preserve credentials and sessions for employees and managers", async () => {
  for (const role of ["USER", "MANAGER"]) {
    const { state, transaction } = accountStore({ role });
    const result = await updateManagedAccount(transaction, administrator, "employee-1", { name: "New Name", email: "employee@example.com" });
    assert.equal(result.ok, true);
    assert.equal(state.account.name, "New Name");
    assert.equal(state.account.password, "old-hash");
    assert.equal(state.account.role, role);
    assert.equal(state.sessions.length, 3);
    assert.equal("password" in result.user, false);
  }
});

test("changing an email revokes only the edited user's sessions", async () => {
  const { state, transaction } = accountStore();
  const result = await updateManagedAccount(transaction, administrator, "employee-1", { email: "new@example.com" });
  assert.equal(result.ok, true);
  assert.equal(state.account.email, "new@example.com");
  assert.equal(state.account.password, "old-hash");
  assert.deepEqual(state.sessions, [{ userId: "employee-2" }]);
});

test("password resets store a usable hash, omit it from responses, and revoke sessions", async () => {
  const password = "New-Password42!";
  const passwordHash = await hashPassword(password);
  const { state, transaction } = accountStore();
  const result = await updateManagedAccount(transaction, administrator, "employee-1", { passwordHash });
  assert.equal(result.ok, true);
  assert.notEqual(state.account.password, password);
  assert.equal(await verifyPassword(password, state.account.password), true);
  assert.equal(await verifyPassword("Wrong-Password42!", state.account.password), false);
  assert.equal("password" in result.user, false);
  assert.equal("passwordHash" in result.user, false);
  assert.deepEqual(state.sessions, [{ userId: "employee-2" }]);
});

test("failed credential writes do not revoke sessions or report success", async () => {
  const { state, transaction } = accountStore();
  const duplicate = Object.assign(new Error("Duplicate email"), { code: "P2002" });
  transaction.user.update = async () => { throw duplicate; };
  await assert.rejects(updateManagedAccount(transaction, administrator, "employee-1", { email: "taken@example.com" }), (error) => error === duplicate);
  assert.equal(state.account.email, "employee@example.com");
  assert.equal(state.sessions.length, 3);
});

test("session revocation failure aborts the account operation for transaction rollback", async () => {
  const { transaction } = accountStore();
  transaction.session.deleteMany = async () => { throw new Error("Session storage unavailable"); };
  await assert.rejects(updateManagedAccount(transaction, administrator, "employee-1", { passwordHash: "new-hash" }), /Session storage unavailable/);
});
