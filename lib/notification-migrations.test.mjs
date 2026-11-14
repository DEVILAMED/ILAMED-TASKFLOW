import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("migration history creates every notification type declared by Prisma", async () => {
  const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const definition = schema.match(/enum NotificationType\s*\{([^}]+)\}/)?.[1];
  assert.ok(definition, "Prisma must declare its notification types");
  const expected = definition.split(/\r?\n/).map(line => line.trim()).filter(line => /^[A-Z_]+$/.test(line));
  const directory = new URL("../prisma/migrations/", import.meta.url);
  const migrations = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const actual = new Set();
  for (const migration of migrations) {
    const sql = await readFile(new URL(`${migration}/migration.sql`, directory), "utf8");
    const initial = sql.match(/CREATE TYPE "NotificationType" AS ENUM\s*\(([\s\S]*?)\)/)?.[1];
    for (const match of initial?.matchAll(/'([^']+)'/g) ?? []) actual.add(match[1]);
    for (const match of sql.matchAll(/ALTER TYPE "NotificationType" ADD VALUE\s+(?:IF NOT EXISTS\s+)?'([^']+)'/g)) actual.add(match[1]);
  }
  const missing = expected.filter(value => !actual.has(value));
  assert.deepEqual(missing, [], `Database migrations are missing notification types: ${missing.join(", ")}`);
});
