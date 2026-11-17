import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (user.role !== UserRole.ADMIN) {
    return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });
  }

  const employees = await prisma.user.findMany({
    select: { id: true, lastSeenAt: true },
  });

  return NextResponse.json({
    ok: true,
    employees: employees.map((employee) => ({
      id: employee.id,
      lastSeenAt: employee.lastSeenAt?.toISOString() ?? null,
    })),
    checkedAt: new Date().toISOString(),
  });
}
