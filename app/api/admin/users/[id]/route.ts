import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { parseAccountUpdate, updateManagedAccount } from "@/lib/user-accounts";

type RouteContext = { params: Promise<{ id: string }> };

function isUserRole(value: unknown): value is UserRole {
  return Object.values(UserRole).some((role) => role === value);
}

async function requireAdministrator() {
  const actor = await getCurrentUser();
  if (!actor) {
    return { response: NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 }) };
  }
  if (actor.role !== UserRole.ADMIN) {
    return { response: NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 }) };
  }
  return { actor };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const authorization = await requireAdministrator();
  if ("response" in authorization) return authorization.response;
  const { actor } = authorization;
  const { id } = await params;
  if (id === actor.id) {
    return NextResponse.json({ ok: false, error: "You cannot change your own administrator account." }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    payload = body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (["name", "email", "password"].some((key) => key in payload)) {
    const parsed = parseAccountUpdate(payload);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    const { password, ...details } = parsed.data;
    const passwordHash = password !== undefined ? await hashPassword(password) : undefined;
    try {
      const result = await prisma.$transaction(
        (transaction) => updateManagedAccount(transaction, actor, id, { ...details, passwordHash }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      const { status, ...body } = result;
      return NextResponse.json(body, { status });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return NextResponse.json({ ok: false, error: "That email address is already in use." }, { status: 409 });
        }
        if (error.code === "P2025") {
          return NextResponse.json({ ok: false, error: "Employee account not found." }, { status: 404 });
        }
        if (error.code === "P2034") {
          return NextResponse.json({ ok: false, error: "This account was updated by someone else. Please try again." }, { status: 409 });
        }
      }
      throw error;
    }
  }

  if ("isBlocked" in payload) {
    const isBlocked = payload?.isBlocked;
    if (Object.keys(payload ?? {}).length !== 1 || typeof isBlocked !== "boolean") {
      return NextResponse.json({ ok: false, error: "Choose whether to block or restore this account." }, { status: 400 });
    }

    const updatedUser = await prisma.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: { id },
        select: { id: true, role: true },
      });
      if (!target || target.role === UserRole.ADMIN) return null;

      const account = await transaction.user.update({
        where: { id },
        data: { isBlocked },
        select: { id: true, isBlocked: true },
      });
      if (account.isBlocked) {
        await transaction.session.deleteMany({ where: { userId: id } });
      }
      return account;
    });

    if (!updatedUser) {
      return NextResponse.json({ ok: false, error: "Employee account not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, user: updatedUser });
  }

  const role = payload?.role;
  if (Object.keys(payload ?? {}).length !== 1 || !isUserRole(role) || role === UserRole.MANAGER) {
    return NextResponse.json(
      { ok: false, error: "Choose ADMIN or USER. Manager access is granted through team assignment." },
      { status: 400 },
    );
  }

  try {
    const updatedUser = await prisma.$transaction(
      async (transaction) => {
        const target = await transaction.user.findUnique({
          where: { id },
          select: { id: true, role: true },
        });
        if (!target) return null;

        if (target.role === UserRole.ADMIN && role === UserRole.USER) {
          const adminCount = await transaction.user.count({ where: { role: UserRole.ADMIN } });
          if (adminCount <= 1) return "last-admin" as const;
        }
        if (target.role === UserRole.MANAGER) {
          const managedTeamCount = await transaction.teamMembership.count({
            where: { userId: id, role: "MANAGER" },
          });
          if (managedTeamCount > 0) return "managed-teams" as const;
        }

        return transaction.user.update({
          where: { id },
          data: { role },
          select: { id: true, email: true, name: true, role: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (updatedUser === null) {
      return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
    }
    if (updatedUser === "last-admin") {
      return NextResponse.json({ ok: false, error: "The last administrator cannot be demoted." }, { status: 409 });
    }
    if (updatedUser === "managed-teams") {
      return NextResponse.json({ ok: false, error: "Assign another manager to this user's teams before changing their account role." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, user: updatedUser });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ ok: false, error: "Another role update occurred. Please try again." }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const authorization = await requireAdministrator();
  if ("response" in authorization) return authorization.response;
  const { actor } = authorization;
  const { id } = await params;
  if (id === actor.id) {
    return NextResponse.json({ ok: false, error: "You cannot delete your own account." }, { status: 400 });
  }

  try {
    const deleted = await prisma.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: { id },
        select: { id: true, role: true },
      });
      if (!target || target.role === UserRole.ADMIN) return false;

      const managerMemberships = await transaction.teamMembership.findMany({
        where: { userId: id, role: "MANAGER" },
        select: { id: true, teamId: true },
      });
      for (const membership of managerMemberships) {
        const replacementExists = await transaction.teamMembership.findFirst({
          where: { teamId: membership.teamId, role: "MANAGER", userId: { not: id } },
          select: { id: true },
        });
        if (replacementExists) continue;

        const actorMembership = await transaction.teamMembership.findUnique({
          where: { teamId_userId: { teamId: membership.teamId, userId: actor.id } },
          select: { id: true },
        });
        if (actorMembership) {
          await transaction.teamMembership.update({
            where: { id: actorMembership.id },
            data: { role: "MANAGER" },
          });
        } else {
          await transaction.teamMembership.update({
            where: { id: membership.id },
            data: { userId: actor.id },
          });
        }
      }

      await transaction.project.updateMany({ where: { ownerId: id }, data: { ownerId: actor.id } });
      await transaction.team.updateMany({ where: { createdById: id }, data: { createdById: actor.id } });
      await transaction.task.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await transaction.comment.deleteMany({ where: { userId: id } });
      await transaction.activity.deleteMany({ where: { userId: id } });
      await transaction.membership.deleteMany({ where: { userId: id } });
      await transaction.user.delete({ where: { id } });
      return true;
    });

    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Employee account not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        { ok: false, error: "This account still owns company data that could not be transferred. No data was deleted." },
        { status: 409 },
      );
    }
    throw error;
  }
}
