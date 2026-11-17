CREATE TABLE "TaskSubmissionImage" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskSubmissionImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskSubmissionImage_submissionId_createdAt_idx" ON "TaskSubmissionImage"("submissionId", "createdAt");

ALTER TABLE "TaskSubmissionImage" ADD CONSTRAINT "TaskSubmissionImage_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "TaskSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
