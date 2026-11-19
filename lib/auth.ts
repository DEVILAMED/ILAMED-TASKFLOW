import crypto from "crypto";
import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDatabaseConnectionError } from "@/lib/database-errors";
import { userAvatarUrl } from "@/lib/user-avatar";

export { isValidEmail, isStrongPassword } from "@/lib/user-accounts";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  avatarUrl: string | null;
};

export const SESSION_COOKIE = "ilamed_session";
const SESSION_TTL_DAYS = 7;
const SESSION_REFRESH_WINDOW_MS = 12 * 60 * 60 * 1000;

const authThrottle = new Map<string, { count: number; resetAt: number }>();

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sessionExpiresAt(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function getClientIpAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const realIp = headers.get("x-real-ip") ?? "";
  const candidate = forwarded.split(",")[0]?.trim() || realIp.trim() || "unknown";
  return candidate || "unknown";
}

export function enforceAuthRateLimit(key: string, maxRequests = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const previous = authThrottle.get(key);

  if (!previous || previous.resetAt <= now) {
    authThrottle.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (previous.count >= maxRequests) {
    return false;
  }

  previous.count += 1;
  authThrottle.set(key, previous);
  return true;
}

export async function createSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = sessionExpiresAt();

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function deleteSessionByToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);

  try {
    await prisma.session.deleteMany({
      where: {
        tokenHash,
      },
    });
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      console.warn("Skipping session delete because the database connection is unavailable.");
      return;
    }

    throw error;
  }
}

export async function deleteUserSessions(userId: string): Promise<void> {
  try {
    await prisma.session.deleteMany({
      where: {
        userId,
      },
    });
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      console.warn("Skipping session cleanup because the database connection is unavailable.");
      return;
    }

    throw error;
  }
}

async function resolveSessionUser(
  token: string | null | undefined,
  refreshCookie?: (expiresAt: Date) => void,
): Promise<AuthUser | null> {
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);

  let session:
    | {
        id: string;
        expiresAt: Date;
        user: AuthUser;
        userIsBlocked: boolean;
      }
    | null;

  try {
    const foundSession = await prisma.session.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            avatar: true,
            isBlocked: true,
          },
        },
      },
    });
    session = foundSession
      ? {
          id: foundSession.id,
          expiresAt: foundSession.expiresAt,
          user: {
            id: foundSession.user.id,
            email: foundSession.user.email,
            name: foundSession.user.name,
            role: foundSession.user.role,
            avatarUrl: userAvatarUrl(foundSession.user.id, foundSession.user.avatar),
          },
          userIsBlocked: foundSession.user.isBlocked,
        }
      : null;
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      console.warn("Session lookup failed because the database connection is unavailable.");
      return null;
    }

    throw error;
  }

  if (!session) {
    return null;
  }

  if (session.userIsBlocked) {
    try {
      await prisma.session.deleteMany({ where: { userId: session.user.id } });
    } catch (error) {
      if (isDatabaseConnectionError(error)) {
        console.warn("Blocked-user session cleanup skipped because the database connection is unavailable.");
      } else {
        throw error;
      }
    }
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    try {
      await prisma.session.deleteMany({
        where: {
          id: session.id,
          expiresAt: { lte: new Date(Date.now()) },
        },
      });
    } catch (error) {
      if (!isDatabaseConnectionError(error)) {
        throw error;
      }
    }

    return null;
  }

  // Only renew from a route that can also send the matching browser cookie.
  // Read-only server renders must not extend just the database expiry.
  if (refreshCookie && session.expiresAt.getTime() - Date.now() < SESSION_REFRESH_WINDOW_MS) {
    const refreshedExpiry = sessionExpiresAt();
    try {
      const refreshed = await prisma.session.updateMany({
        where: { id: session.id, tokenHash, expiresAt: { gt: new Date(Date.now()) }, user: { isBlocked: false } },
        data: { expiresAt: refreshedExpiry },
      });
      // A concurrent logout, password reset or expiry must not recreate a session.
      if (!refreshed.count) return null;
    } catch (error) {
      if (isDatabaseConnectionError(error)) {
        console.warn("Session refresh skipped because the database connection is unavailable.");
        return session.user;
      } else {
        throw error;
      }
    }
    refreshCookie(refreshedExpiry);
  } else if (refreshCookie) {
    // Repair an older cookie or a lost renewal response without extending the
    // database session again. Browsers do not send their cookie expiry to us.
    refreshCookie(session.expiresAt);
  }

  return session.user;
}

export async function getUserBySessionToken(token: string | null | undefined): Promise<AuthUser | null> {
  return resolveSessionUser(token);
}

// refreshSession is only for route handlers, where cookies are mutable.
export async function getCurrentUser({ refreshSession = false }: { refreshSession?: boolean } = {}): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? null;
  return resolveSessionUser(token, refreshSession && token ? (expiresAt) => {
    store.set({
      name: SESSION_COOKIE, value: token, expires: expiresAt,
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    });
  } : undefined);
}
