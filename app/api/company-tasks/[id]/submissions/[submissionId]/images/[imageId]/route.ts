import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { companyTaskAccessWhere } from "@/lib/company-task-access";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

type RouteContext = { params: Promise<{ id: string; submissionId: string; imageId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const { id, submissionId, imageId } = await params;
  const image = await prisma.taskSubmissionImage.findFirst({
    where: {
      id: imageId, submissionId,
      submission: { task: { id, projectId: COMPANY_TASK_PROJECT_ID, ...companyTaskAccessWhere(user) } },
    },
    select: { data: true, mimeType: true, size: true },
  });
  if (!image) return NextResponse.json({ ok: false, error: "Image not found or access denied." }, { status: 404 });
  return new Response(new Uint8Array(image.data), { headers: {
    "Content-Type": image.mimeType,
    "Content-Length": String(image.size),
    "Content-Disposition": "inline; filename=completion-image.webp",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
