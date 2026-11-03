import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id: teamId } = await params;
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
    return NextResponse.json({ ok: false, error: "Manager access is required." }, { status: 403 });
  }

  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      memberships: user.role === UserRole.ADMIN
        ? undefined
        : { some: { userId: user.id, role: "MANAGER" } },
    },
    select: { id: true, memberships: { select: { userId: true } } },
  });
  if (!team) {
    return NextResponse.json({ ok: false, error: "Team not found or manager access required." }, { status: 404 });
  }

  let payload: { email?: unknown } | null = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const email = typeof payload?.email === "string" ? payload.email.trim() : "";
  if (!email) {
    return NextResponse.json({ ok: false, error: "Member email is required." }, { status: 400 });
  }

  const member = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, email: true },
  });
  if (!member) {
    return NextResponse.json({ ok: false, error: "No account found with that email." }, { status: 404 });
  }
  if (team.memberships.some((membership) => membership.userId === member.id)) {
    return NextResponse.json({ ok: false, error: "That user is already on this team." }, { status: 409 });
  }

  await prisma.teamMembership.create({
    data: { teamId, userId: member.id, role: "MEMBER" },
  });

  return NextResponse.json({ ok: true, member }, { status: 201 });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
    return NextResponse.json({ ok: false, error: "Manager access is required." }, { status: 403 });
  }

  const { id: teamId } = await params;
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      memberships: user.role === UserRole.ADMIN
        ? undefined
        : { some: { userId: user.id, role: "MANAGER" } },
    },
    select: {
      id: true,
      memberships: {
        select: { userId: true, role: true },
      },
    },
  });
  if (!team) {
    return NextResponse.json({ ok: false, error: "Team not found or manager access required." }, { status: 404 });
  }

  let payload: { userId?: unknown; role?: unknown } | null = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const memberId = typeof payload?.userId === "string" ? payload.userId.trim() : "";
  const role = payload?.role;
  if (!memberId || (role !== "MANAGER" && role !== "MEMBER")) {
    return NextResponse.json({ ok: false, error: "Choose a member and a valid team role." }, { status: 400 });
  }

  const membership = team.memberships.find((item) => item.userId === memberId);
  if (!membership) {
    return NextResponse.json({ ok: false, error: "Team membership not found." }, { status: 404 });
  }
  if (membership.role === role) {
    return NextResponse.json({ ok: true });
  }
  if (role === "MANAGER") {
    const managerCandidate = await prisma.user.findUnique({
      where: { id: memberId },
      select: { role: true },
    });
    if (!managerCandidate || managerCandidate.role === UserRole.ADMIN) {
      return NextResponse.json({ ok: false, error: "Administrators cannot be assigned as team managers." }, { status: 400 });
    }
  }
  if (role === "MEMBER" && membership.role === "MANAGER" &&
      team.memberships.filter((item) => item.role === "MANAGER").length === 1) {
    return NextResponse.json({ ok: false, error: "A team must have at least one manager." }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMembership.update({
      where: { teamId_userId: { teamId, userId: memberId } },
      data: { role },
    });

    if (role === "MANAGER") {
      await tx.user.updateMany({
        where: { id: memberId, role: "USER" },
        data: { role: "MANAGER" },
      });
    } else {
      const managedTeamsCount = await tx.teamMembership.count({
        where: { userId: memberId, role: "MANAGER" },
      });
      if (managedTeamsCount === 0) {
        await tx.user.updateMany({
          where: { id: memberId, role: "MANAGER" },
          data: { role: "USER" },
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
    return NextResponse.json({ ok: false, error: "Manager access is required." }, { status: 403 });
  }

  const { id: teamId } = await params;
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      memberships: user.role === UserRole.ADMIN
        ? undefined
        : { some: { userId: user.id, role: "MANAGER" } },
    },
    select: {
      id: true,
      memberships: { select: { userId: true, role: true } },
    },
  });
  if (!team) {
    return NextResponse.json({ ok: false, error: "Team not found or manager access required." }, { status: 404 });
  }

  let payload: { userId?: unknown } | null = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const memberId = typeof payload?.userId === "string" ? payload.userId.trim() : "";
  const membership = team.memberships.find((item) => item.userId === memberId);
  if (!membership) {
    return NextResponse.json({ ok: false, error: "Team membership not found." }, { status: 404 });
  }
  if (membership.role === "MANAGER" &&
      team.memberships.filter((item) => item.role === "MANAGER").length === 1) {
    return NextResponse.json({ ok: false, error: "A team must have at least one manager." }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMembership.delete({
      where: { teamId_userId: { teamId, userId: memberId } },
    });
    const managedTeamsCount = await tx.teamMembership.count({
      where: { userId: memberId, role: "MANAGER" },
    });
    if (managedTeamsCount === 0) {
      await tx.user.updateMany({
        where: { id: memberId, role: "MANAGER" },
        data: { role: "USER" },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
