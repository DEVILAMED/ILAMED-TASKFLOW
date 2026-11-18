import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { isSunday } from "@/lib/company-workdays";
import { prisma } from "@/lib/prisma";
import { taskDateKey } from "@/lib/task-dates";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ ok: false, error: "Sign in to manage leave." }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Only administrators can manage leave." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const day = body?.day;
  const onLeave = body?.onLeave;
  if (typeof day !== "string" || taskDateKey(day) !== day || typeof onLeave !== "boolean") {
    return NextResponse.json({ ok: false, error: "Choose a valid leave date." }, { status: 400 });
  }
  if (isSunday(day)) {
    return NextResponse.json({ ok: false, error: "Sunday is already a company holiday." }, { status: 400 });
  }

  const { id } = await params;
  const date = new Date(day + "T00:00:00Z");
  try {
    await prisma.user.update({
      where: { id, role: { not: "ADMIN" } },
      data: {
        leaveDays: onLeave
          ? { createMany: { data: [{ day: date }], skipDuplicates: true } }
          : { deleteMany: { day: date } },
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ ok: false, error: "Employee not found." }, { status: 404 });
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}
