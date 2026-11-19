import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const HEARTBEAT_WRITE_INTERVAL_MS = 45_000;

export async function POST() {
  const user = await getCurrentUser({ refreshSession: true });
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  await prisma.user.updateMany({
    where: {
      id: user.id,
      OR: [
        { lastSeenAt: null },
        { lastSeenAt: { lt: new Date(now.getTime() - HEARTBEAT_WRITE_INTERVAL_MS) } },
      ],
    },
    data: { lastSeenAt: now },
  });

  return NextResponse.json({ ok: true, lastSeenAt: now.toISOString() });
}
