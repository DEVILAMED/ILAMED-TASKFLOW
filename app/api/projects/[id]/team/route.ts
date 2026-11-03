import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessibleProjectWhere } from "@/project-access";
import { canManageProject } from "@/lib/project-task-permissions";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id: projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...accessibleProjectWhere(user.id) },
    select: {
      id: true,
      ownerId: true,
      members: { select: { userId: true } },
      team: { select: { memberships: { select: { userId: true, role: true } } } },
    },
  });
  if (!project) {
    return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
  }
  if (!canManageProject(project, user.id)) {
    return NextResponse.json({ ok: false, error: "Only the project owner or connected team manager can change team access." }, { status: 403 });
  }

  let payload: { teamId?: unknown } | null = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const teamId = typeof payload?.teamId === "string" && payload.teamId ? payload.teamId : null;
  if (teamId) {
    const managedTeam = await prisma.team.findFirst({
      where: {
        id: teamId,
        memberships: { some: { userId: user.id, role: "MANAGER" } },
      },
      select: { id: true },
    });
    if (!managedTeam) {
      return NextResponse.json({ ok: false, error: "Choose a team you manage." }, { status: 403 });
    }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { teamId },
  });

  return NextResponse.json({ ok: true });
}
