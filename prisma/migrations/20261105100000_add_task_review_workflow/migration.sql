ALTER TYPE "TaskStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "TaskStatus" ADD VALUE 'ON_HOLD';
ALTER TYPE "TaskStatus" ADD VALUE 'SUBMITTED_FOR_REVIEW';
ALTER TYPE "TaskStatus" ADD VALUE 'REVISION_REQUESTED';
ALTER TYPE "TaskStatus" ADD VALUE 'APPROVED';
ALTER TYPE "TaskStatus" ADD VALUE 'REJECTED';
ALTER TYPE "TaskStatus" ADD VALUE 'CANCELLED';

CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'REVISION_REQUESTED', 'REJECTED');

CREATE TABLE "TaskStatusHistory" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" "TaskStatus",
    "toStatus" "TaskStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskReview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "rating" INTEGER,
    "feedback" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskStatusHistory_taskId_createdAt_idx" ON "TaskStatusHistory"("taskId", "createdAt");
CREATE INDEX "TaskStatusHistory_actorId_createdAt_idx" ON "TaskStatusHistory"("actorId", "createdAt");
CREATE INDEX "TaskSubmission_taskId_createdAt_idx" ON "TaskSubmission"("taskId", "createdAt");
CREATE INDEX "TaskSubmission_submittedById_createdAt_idx" ON "TaskSubmission"("submittedById", "createdAt");
CREATE INDEX "TaskReview_submissionId_createdAt_idx" ON "TaskReview"("submissionId", "createdAt");
CREATE INDEX "TaskReview_reviewerId_createdAt_idx" ON "TaskReview"("reviewerId", "createdAt");

ALTER TABLE "TaskStatusHistory" ADD CONSTRAINT "TaskStatusHistory_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskStatusHistory" ADD CONSTRAINT "TaskStatusHistory_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskSubmission" ADD CONSTRAINT "TaskSubmission_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskSubmission" ADD CONSTRAINT "TaskSubmission_submittedById_fkey"
FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskReview" ADD CONSTRAINT "TaskReview_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "TaskSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskReview" ADD CONSTRAINT "TaskReview_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
