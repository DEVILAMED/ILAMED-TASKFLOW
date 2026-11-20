CREATE TABLE "TaskSubmissionAttachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskSubmissionAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskSubmissionAttachment_submissionId_createdAt_idx" ON "TaskSubmissionAttachment"("submissionId", "createdAt");

ALTER TABLE "TaskSubmissionAttachment" ADD CONSTRAINT "TaskSubmissionAttachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TaskSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
