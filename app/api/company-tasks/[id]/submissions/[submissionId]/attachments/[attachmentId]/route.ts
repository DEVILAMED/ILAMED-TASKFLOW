import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { companyTaskAccessWhere } from "@/lib/company-task-access";
import { attachmentContentDisposition } from "@/lib/submission-attachments";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

type RouteContext = { params: Promise<{ id: string; submissionId: string; attachmentId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const { id, submissionId, attachmentId } = await params;
  const file = await prisma.taskSubmissionAttachment.findFirst({
    where: { id: attachmentId, submissionId, submission: { task: { id, projectId: COMPANY_TASK_PROJECT_ID, ...companyTaskAccessWhere(user) } } },
    select: { data: true, mimeType: true, size: true, fileName: true },
  });
  if (!file) return NextResponse.json({ ok: false, error: "Attachment not found or access denied." }, { status: 404 });
  return new Response(new Uint8Array(file.data), { headers: {
    "Content-Type": file.mimeType,
    "Content-Length": String(file.size),
    "Content-Disposition": attachmentContentDisposition(file.fileName),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
  } });
}
