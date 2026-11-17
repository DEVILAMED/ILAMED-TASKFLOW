import type { prisma } from "@/lib/prisma";

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isStrongPassword(value: string): boolean {
  return value.length >= 12 && /[A-Z]/.test(value) && /[a-z]/.test(value)
    && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

type AccountUpdate = { name?: string; email?: string; password?: string };
type AccountValidation = { ok: true; data: AccountUpdate } | { ok: false; error: string };

export function parseAccountUpdate(payload: Record<string, unknown>): AccountValidation {
  const keys = Object.keys(payload);
  if (!keys.length || keys.some((key) => !["name", "email", "password"].includes(key))) {
    return { ok: false, error: "Choose a name, email address, or new password to update." };
  }

  const data: AccountUpdate = {};
  if ("name" in payload) {
    if (typeof payload.name !== "string" || payload.name.trim().length < 2 || payload.name.trim().length > 100) {
      return { ok: false, error: "Name must be between 2 and 100 characters." };
    }
    data.name = payload.name.trim();
  }
  if ("email" in payload) {
    if (typeof payload.email !== "string" || payload.email.trim().length > 254 || !isValidEmail(payload.email.trim())) {
      return { ok: false, error: "Enter a valid email address." };
    }
    data.email = payload.email.trim().toLowerCase();
  }
  if ("password" in payload) {
    if (typeof payload.password !== "string" || payload.password.length > 128 || !isStrongPassword(payload.password)) {
      return { ok: false, error: "Use a password of 12 to 128 characters with uppercase, lowercase, a number, and a symbol." };
    }
    data.password = payload.password;
  }
  return { ok: true, data };
}

type AccountActor = { id: string; role: string };
type AccountChanges = { name?: string; email?: string; passwordHash?: string };
type AccountResult =
  | { ok: false; status: 400 | 401 | 403 | 404; error: string }
  | { ok: true; status: 200; user: { id: string; name: string | null; email: string; role: string } };

// The caller runs this operation inside a transaction so credential changes and
// session revocation either both succeed or both roll back.
export async function updateManagedAccount(
  transaction: Pick<typeof prisma, "user" | "session">,
  actor: AccountActor | null,
  userId: string,
  changes: AccountChanges,
): Promise<AccountResult> {
  if (!actor) return { ok: false, status: 401, error: "Unauthorized." };
  if (actor.role !== "ADMIN") return { ok: false, status: 403, error: "Administrator access is required." };
  if (actor.id === userId) return { ok: false, status: 400, error: "You cannot change your own administrator account." };

  const target = await transaction.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!target || target.role === "ADMIN") {
    return { ok: false, status: 404, error: "Employee account not found." };
  }

  const user = await transaction.user.update({
    where: { id: userId, role: { not: "ADMIN" } },
    data: {
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.email !== undefined ? { email: changes.email } : {}),
      ...(changes.passwordHash !== undefined ? { password: changes.passwordHash } : {}),
    },
    select: { id: true, name: true, email: true, role: true },
  });

  if (changes.passwordHash !== undefined || (changes.email !== undefined && changes.email !== target.email)) {
    await transaction.session.deleteMany({ where: { userId } });
  }
  return { ok: true, status: 200, user };
}
