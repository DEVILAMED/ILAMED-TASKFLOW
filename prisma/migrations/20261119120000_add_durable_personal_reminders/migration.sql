ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PERSONAL_TASK_REMINDER';

ALTER TABLE "TodoTask" ADD COLUMN "reminderProcessedAt" TIMESTAMP(3);
ALTER TABLE "Notification"
  ADD COLUMN "todoTaskId" TEXT,
  ADD COLUMN "reminderAt" TIMESTAMP(3),
  ADD COLUMN "desktopClaimedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Notification_userId_todoTaskId_reminderAt_key" ON "Notification"("userId", "todoTaskId", "reminderAt");
CREATE INDEX "Notification_userId_type_desktopClaimedAt_idx" ON "Notification"("userId", "type", "desktopClaimedAt");
CREATE INDEX "TodoTask_isCompleted_reminderProcessedAt_reminderAt_idx" ON "TodoTask"("isCompleted", "reminderProcessedAt", "reminderAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_todoTaskId_fkey"
  FOREIGN KEY ("todoTaskId") REFERENCES "TodoTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
