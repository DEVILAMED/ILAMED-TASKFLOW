import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { claimPersonalTaskReminders, dispatchPersonalTaskReminders } from "@/services/personal-task-reminders";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  await dispatchPersonalTaskReminders(user.id);
  const reminders = await claimPersonalTaskReminders(user.id);
  return NextResponse.json({ ok: true, reminders }, { headers: { "Cache-Control": "private, no-store" } });
}
