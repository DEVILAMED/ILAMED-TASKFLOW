import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { listProjectsForUser } from "@/services/projectService";

type ProjectPayload = {
  title?: string;
  name?: string;
  description?: string;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  const projects = await listProjectsForUser(user.id);

  return NextResponse.json({ ok: true, projects });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  let payload: ProjectPayload | null = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const rawTitle =
    typeof payload?.title === "string"
      ? payload.title
      : typeof payload?.name === "string"
        ? payload.name
        : "";
  const title = rawTitle.trim();
  const description =
    typeof payload?.description === "string"
      ? payload.description.trim()
      : "";

  if (title.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Project name must be at least 2 characters." },
      { status: 400 },
    );
  }

  const project = await prisma.project.create({
    data: {
      title,
      description: description || null,
      ownerId: user.id,
    },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, project }, { status: 201 });
}
