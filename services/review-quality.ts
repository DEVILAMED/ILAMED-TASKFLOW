import { prisma } from "@/lib/prisma";
import type { ReviewWindow } from "@/lib/review-quality";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import { USER_IDENTITY_SELECT, userAvatarUrl } from "@/lib/user-avatar";

export async function getReviewEvidence(window: ReviewWindow, employeeIds?: readonly string[]) {
  const reviews = await prisma.taskReview.findMany({
    where: {
      createdAt: { gte: window.start, lt: window.end },
      submission: {
        task: { projectId: COMPANY_TASK_PROJECT_ID },
        ...(employeeIds === undefined ? {} : { submittedById: { in: [...employeeIds] } }),
      },
    },
    select: {
      id: true, rating: true, decision: true, createdAt: true, feedback: true,
      reviewer: { select: { name: true, email: true } },
      submission: { select: { taskId: true, createdAt: true, task: { select: { title: true } }, submittedById: true, submittedBy: { select: USER_IDENTITY_SELECT } } },
    },
  });
  return reviews.map(review => ({
    id: review.id,
    rating: review.rating,
    decision: review.decision,
    createdAt: review.createdAt,
    submittedAt: review.submission.createdAt,
    taskId: review.submission.taskId,
    employeeId: review.submission.submittedById,
    employeeName: review.submission.submittedBy.name || review.submission.submittedBy.email,
    employeeAvatarUrl: userAvatarUrl(review.submission.submittedById, review.submission.submittedBy.avatar),
    taskTitle: review.submission.task.title,
    reviewerName: review.reviewer.name || review.reviewer.email,
    feedback: review.feedback,
  }));
}
