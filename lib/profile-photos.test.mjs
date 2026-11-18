import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import sharp from "sharp";
import * as policy from "./profile-photo-policy.ts";
import * as avatars from "./user-avatar.ts";
import * as limitedForm from "./limited-form-data.ts";

const require = createRequire(import.meta.url);
function loadModule(relativePath, dependencies) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name] ?? require(name), compiled, compiled.exports);
  return compiled.exports;
}
const preparation = loadModule("./prepare-profile-photo.ts", { "@/lib/profile-photo-policy": policy, "@/lib/user-avatar": avatars });
const employee = { id: "employee", role: "USER" };
const admin = { id: "admin", role: "ADMIN" };
const manager = { id: "manager", role: "MANAGER" };

async function image(type = "png", color = "red") {
  const data = await sharp({ create: { width: 80, height: 40, channels: 3, background: color } }).withMetadata({ orientation: 6 }).toFormat(type).toBuffer();
  return new File([data], `../private-name.${type}`, { type: `image/${type === "jpeg" ? "jpeg" : type}` });
}

function fixture(actor = employee, { promoteAtWrite = false } = {}) {
  const users = new Map([employee, admin, manager, { id: "other", role: "USER" }, { id: "other-admin", role: "ADMIN" }].map(user => [user.id, { ...user, avatar: null }]));
  let writes = 0;
  let reads = 0;
  const prisma = { user: {
    findUnique: async ({ where }) => { reads++; return users.get(where.id) ?? null; },
    updateMany: async ({ where, data }) => {
      const user = users.get(where.id);
      if (promoteAtWrite && user) user.role = "ADMIN";
      if (!user || (where.role?.not && user.role === where.role.not)) return { count: 0 };
      Object.assign(user, data); writes++;
      return { count: 1 };
    },
  } };
  const route = loadModule("../app/api/users/[id]/avatar/route.ts", {
    "@/lib/auth": { getCurrentUser: async () => actor },
    "@/lib/prisma": { prisma },
    "@/lib/profile-photo-policy": policy,
    "@/lib/limited-form-data": limitedForm,
    "@/lib/prepare-profile-photo": preparation,
    "@/lib/user-avatar": avatars,
  });
  function context(id) { return { params: Promise.resolve({ id }) }; }
  async function upload(id, files, extra = []) {
    const form = new FormData();
    for (const file of files) form.append("photo", file);
    for (const [key, value] of extra) form.append(key, value);
    return route.POST(new Request("http://localhost/api/users/avatar", { method: "POST", body: form }), context(id));
  }
  return {
    users, route, upload, context,
    get: id => route.GET(new Request("http://localhost"), context(id)),
    remove: id => route.DELETE(new Request("http://localhost", { method: "DELETE" }), context(id)),
    writes: () => writes,
    reads: () => reads,
  };
}

test("employees, managers and administrators can upload and remove their own profile pictures", async () => {
  for (const actor of [employee, manager, admin]) {
    const api = fixture(actor);
    const response = await api.upload(actor.id, [await image()]);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.match(result.avatarUrl, new RegExp(`^/api/users/${actor.id}/avatar\\?v=`));
    assert.equal((await api.remove(actor.id)).status, 200);
    assert.equal(api.users.get(actor.id).avatar, null);
    assert.equal((await api.get(actor.id)).status, 404);
  }
});

test("JPEG, PNG and WebP uploads become metadata-free square thumbnails", async () => {
  for (const format of ["jpeg", "png", "webp"]) {
    const stored = await preparation.prepareProfilePhoto(await image(format));
    const data = avatars.readStoredAvatar(stored);
    assert.ok(data);
    const metadata = await sharp(data).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 256);
    assert.equal(metadata.height, 256);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.orientation, undefined);
    assert.ok(data.byteLength <= 128 * 1024);
  }
});

test("signed-out requests cannot read or change any profile picture", async () => {
  const api = fixture(null);
  assert.equal((await api.upload(employee.id, [await image()])).status, 401);
  assert.equal((await api.get(employee.id)).status, 401);
  assert.equal((await api.remove(employee.id)).status, 401);
  assert.equal(api.writes(), 0);
  assert.equal(api.reads(), 0);
});

test("employees and managers cannot upload or remove another user's picture", async () => {
  for (const actor of [employee, manager]) {
    const api = fixture(actor);
    assert.equal((await api.upload("other", [await image()])).status, 403);
    assert.equal((await api.remove("other")).status, 403);
    assert.equal(api.writes(), 0);
  }
});

test("administrators can manage employee pictures while other administrator accounts remain protected", async () => {
  const api = fixture(admin);
  assert.equal((await api.upload("employee", [await image()])).status, 200);
  assert.equal((await api.remove("employee")).status, 200);
  assert.equal((await api.upload("other-admin", [await image()])).status, 404);
  assert.equal((await api.remove("other-admin")).status, 404);
  assert.equal(api.users.get("other-admin").avatar, null);
});

test("authorization is rechecked at the write if the employee becomes an administrator", async () => {
  const api = fixture(admin, { promoteAtWrite: true });
  assert.equal((await api.upload("employee", [await image()])).status, 409);
  assert.equal(api.writes(), 0);
});

test("uploads require exactly one file and reject ownership or role fields", async () => {
  const api = fixture();
  const file = await image();
  for (const files of [[], [file, file]]) assert.equal((await api.upload(employee.id, files)).status, 400);
  assert.equal((await api.upload(employee.id, [file], [["userId", "other"]])).status, 400);
  assert.equal((await api.upload(employee.id, [file], [["role", "ADMIN"]])).status, 400);
  assert.equal((await api.upload(employee.id, ["not a file"])).status, 400);
  assert.equal(api.writes(), 0);
});

test("invalid, empty, corrupt and spoofed files never replace an existing picture", async () => {
  const api = fixture();
  await api.upload(employee.id, [await image()]);
  const original = api.users.get(employee.id).avatar;
  const validPng = await image();
  const files = [
    new File([], "empty.png", { type: "image/png" }),
    new File(["<svg onload='alert(1)'></svg>"], "photo.svg", { type: "image/svg+xml" }),
    new File(["<svg onload='alert(1)'></svg>"], "photo.png", { type: "image/png" }),
    new File(["RIFFinvalidWEBPcorrupt"], "photo.webp", { type: "image/webp" }),
    new File([await validPng.arrayBuffer()], "fake.jpg", { type: "image/jpeg" }),
    new File([new Uint8Array(policy.MAX_PROFILE_PHOTO_BYTES + 1)], "large.png", { type: "image/png" }),
  ];
  for (const file of files) assert.equal((await api.upload(employee.id, [file])).status, 400);
  assert.equal(api.users.get(employee.id).avatar, original);
  assert.equal(api.writes(), 1);
});

test("streamed request limits hold even when Content-Length understates the upload", async () => {
  const api = fixture();
  let chunks = 0;
  const body = new ReadableStream({ pull(controller) {
    if (chunks++ < 82) controller.enqueue(new Uint8Array(64 * 1024));
    else controller.close();
  } });
  const response = await api.route.POST(new Request("http://localhost", {
    method: "POST", body, duplex: "half", headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": "1" },
  }), api.context(employee.id));
  assert.equal(response.status, 413);
  assert.equal(api.writes(), 0);
});

test("replacing a picture changes its URL and serves only the current normalized image", async () => {
  const api = fixture();
  const first = await (await api.upload(employee.id, [await image("png", "red")])).json();
  const second = await (await api.upload(employee.id, [await image("png", "blue")])).json();
  assert.notEqual(first.avatarUrl, second.avatarUrl);
  assert.equal(JSON.stringify(second).includes("base64"), false);
  const response = await api.get(employee.id);
  assert.equal(response.headers.get("Content-Type"), "image/webp");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), avatars.readStoredAvatar(api.users.get(employee.id).avatar));
});

test("identity serialization returns a versioned URL instead of stored photo bytes", () => {
  const stored = `${avatars.AVATAR_DATA_PREFIX}UklGRgAAAABXRUJQ`;
  const user = avatars.withAvatarUrl({ id: "person/?id=other", name: "Alex", email: "alex@example.com", avatar: stored });
  assert.equal("avatar" in user, false);
  assert.match(user.avatarUrl, /^\/api\/users\/person%2F%3Fid%3Dother\/avatar\?v=/);
  assert.equal(avatars.withAvatarUrl({ id: "empty", avatar: null }).avatarUrl, null);
  assert.equal(avatars.readStoredAvatar("https://example.com/photo.jpg"), null);
  assert.equal(avatars.readStoredAvatar("data:image/svg+xml;base64,PHN2Zz4="), null);
});
