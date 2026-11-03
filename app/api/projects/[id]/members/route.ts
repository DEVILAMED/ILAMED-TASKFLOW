import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { accessibleProjectWhere } from "@/project-access";
import { canManageProject } from "@/lib/project-task-permissions";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function getProjectForAccess(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, ...accessibleProjectWhere(userId) },
    select: {
      id: true,
      ownerId: true,
      owner: { select: { email: true } },
      members: { select: { userId: true } },
      team: { select: { memberships: { select: { userId: true, role: true } } } },
    },
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id: projectId } = await params;
  const project = await getProjectForAccess(projectId, user.id);
  if (!project) {
    return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
  }
  if (!canManageProject(project, user.id)) {
    return NextResponse.json({ ok: false, error: "Only the project owner or connected team manager can invite members." }, { status: 403 });
  }

  let payload: { email?: unknown } | null = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ ok: false, error: "Member email is required." }, { status: 400 });
  }
  if (project.owner.email.toLowerCase() === email) {
    return NextResponse.json({ ok: false, error: "The project owner already has access." }, { status: 409 });
  }

  const member = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, email: true },
  });
  if (!member) {
    return NextResponse.json({ ok: false, error: "No user found with that email." }, { status: 404 });
  }
  if (project.members.some((item) => item.userId === member.id)) {
    return NextResponse.json({ ok: false, error: "That user is already on this project." }, { status: 409 });
  }

  await prisma.membership.create({
    data: { projectId, userId: member.id, role: "MEMBER" },
  });
  return NextResponse.json({ ok: true, member }, { status: 201 });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id: projectId } = await params;
  const project = await getProjectForAccess(projectId, user.id);
  if (!project) {
    return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
  }
  if (project.ownerId !== user.id) {
    return NextResponse.json({ ok: false, error: "Only the project owner can transfer ownership." }, { status: 403 });
  }

  let payload: { newOwnerId?: unknown } | null = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const newOwnerId = typeof payload?.newOwnerId === "string" ? payload.newOwnerId.trim() : "";
  if (!newOwnerId || newOwnerId === user.id) {
    return NextResponse.json({ ok: false, error: "Choose another project member as the new owner." }, { status: 400 });
  }
  if (!project.members.some((member) => member.userId === newOwnerId)) {
    return NextResponse.json({ ok: false, error: "Ownership can only be transferred to a direct project member." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: { ownerId: newOwnerId },
    });
    await tx.membership.deleteMany({ where: { projectId, userId: newOwnerId } });
    await tx.membership.upsert({
      where: { userId_projectId: { userId: user.id, projectId } },
      create: { userId: user.id, projectId, role: "MEMBER" },
      update: { role: "MEMBER" },
    });
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id: projectId } = await params;
  const project = await getProjectForAccess(projectId, user.id);
  if (!project) {
    return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
  }
  if (!canManageProject(project, user.id)) {
    return NextResponse.json({ ok: false, error: "Only the project owner or connected team manager can remove project members." }, { status: 403 });
  }

  let payload: { userId?: unknown } | null = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const memberId = typeof payload?.userId === "string" ? payload.userId.trim() : "";
  if (!memberId || memberId === project.ownerId) {
    return NextResponse.json({ ok: false, error: "The project owner cannot be removed." }, { status: 400 });
  }
  if (!project.members.some((member) => member.userId === memberId)) {
    return NextResponse.json({ ok: false, error: "Direct project membership not found." }, { status: 404 });
  }

  await prisma.membership.delete({
    where: { userId_projectId: { userId: memberId, projectId } },
  });
  return NextResponse.json({ ok: true });
}
