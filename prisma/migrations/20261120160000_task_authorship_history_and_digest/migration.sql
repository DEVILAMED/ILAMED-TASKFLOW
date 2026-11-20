ALTER TABLE "Task" ADD COLUMN "createdById" TEXT, ADD COLUMN "archivedAt" TIMESTAMP(3), ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "TaskSubmission" ADD COLUMN "detailsSnapshot" JSONB;
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMPANY_TASK_DIGEST';

-- Recover creators only from creation events, never from the mutable assigner.
UPDATE "Task" t SET "createdById" = h."actorId" FROM (
  SELECT DISTINCT ON ("taskId") "taskId", "actorId" FROM "TaskStatusHistory"
  WHERE "fromStatus" IS NULL ORDER BY "taskId", "createdAt", "id"
) h WHERE t."id" = h."taskId";
UPDATE "Task" t SET "createdById" = r."createdById" FROM "CompanyTaskRecurrence" r
WHERE t."recurrenceId" = r."id" AND t."createdById" IS NULL;

ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");
CREATE INDEX "Task_projectId_deletedAt_archivedAt_assigneeId_status_idx" ON "Task"("projectId", "deletedAt", "archivedAt", "assigneeId", "status");
CREATE TABLE "TaskChange" (
  "id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "action" TEXT NOT NULL,
  "before" JSONB NOT NULL, "after" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaskChange_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TaskChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TaskChange_taskId_createdAt_idx" ON "TaskChange"("taskId", "createdAt");
CREATE TABLE "CompanyDigestDelivery" (
  "userId" TEXT NOT NULL, "day" DATE NOT NULL,
  CONSTRAINT "CompanyDigestDelivery_pkey" PRIMARY KEY ("userId", "day"),
  CONSTRAINT "CompanyDigestDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
