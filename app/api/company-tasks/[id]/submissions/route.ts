import { submissionAttachmentSelect, submissionAttachmentUrl } from "@/lib/submission-attachments";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { companyTaskAccessWhere } from "@/lib/company-task-access";
import { submissionImageSelect, submissionImageUrl } from "@/lib/submission-images";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const task = await prisma.task.findFirst({
    where: { id, projectId: COMPANY_TASK_PROJECT_ID, ...companyTaskAccessWhere(user) },
    select: { submissions: {
      orderBy: { createdAt: "desc" }, take: 20,
      select: {
        id: true, notes: true, createdAt: true,
        submittedBy: { select: { name: true, email: true } },
        attachments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: submissionAttachmentSelect },
        images: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: submissionImageSelect },
      },
    } },
  });
  if (!task) return NextResponse.json({ ok: false, error: "Task not found or access denied." }, { status: 404 });
  return NextResponse.json({ ok: true, submissions: task.submissions.map((submission) => ({
    id: submission.id, notes: submission.notes, createdAt: submission.createdAt.toISOString(),
    submitter: submission.submittedBy.name || submission.submittedBy.email,
    attachments: (submission.attachments ?? []).map(file => ({ ...file, url: submissionAttachmentUrl(id, submission.id, file.id) })),
    images: submission.images.map((image) => ({ ...image, url: submissionImageUrl(id, submission.id, image.id) })),
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}
