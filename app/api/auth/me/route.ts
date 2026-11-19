import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser({ refreshSession: true });
  return NextResponse.json({ ok: true, user }, { headers: { "Cache-Control": "private, no-store" } });
}
