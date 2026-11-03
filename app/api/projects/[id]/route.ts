import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { accessibleProjectWhere } from "@/project-access";
import { canManageProject } from "@/lib/project-task-permissions";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  const { id: projectId } = await params;
  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "Project id is required." },
      { status: 400 },
    );
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...accessibleProjectWhere(user.id),
    },
    select: {
      id: true,
      ownerId: true,
      members: {
        select: {
          userId: true,
        },
      },
      team: {
        select: {
          memberships: { select: { userId: true, role: true } },
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Project not found." },
      { status: 404 },
    );
  }

  if (!canManageProject(project, user.id)) {
    return NextResponse.json(
      { ok: false, error: "Only the project owner or connected team manager can delete this project." },
      { status: 403 },
    );
  }

  try {
    const result = await prisma.project.deleteMany({
      where: {
        id: projectId,
        OR: [
          { ownerId: user.id },
          {
            team: {
              memberships: {
                some: { userId: user.id, role: "MANAGER" },
              },
            },
          },
        ],
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { ok: false, error: "Project not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003") {
        return NextResponse.json(
          {
            ok: false,
            error: "Project has related records and cannot be deleted yet.",
          },
          { status: 409 },
        );
      }
    }

    return NextResponse.json(
      { ok: false, error: "Unable to delete project." },
      { status: 500 },
    );
  }
}
