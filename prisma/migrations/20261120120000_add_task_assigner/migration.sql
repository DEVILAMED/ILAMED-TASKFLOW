ALTER TABLE "Task" ADD COLUMN "assignedById" TEXT;

CREATE INDEX "Task_assignedById_idx" ON "Task"("assignedById");

ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Recover company task assignments only when the latest assignment notification
-- names the current assignee. Leave missing history unknown instead of guessing.
WITH latest_assignment AS (
    SELECT DISTINCT ON ("taskId") "taskId", "userId", "actorId", "type"
    FROM "Notification"
    WHERE "taskId" IS NOT NULL
      AND "projectId" = 'company-task-tracker'
      AND "type" IN ('TASK_ASSIGNED', 'TASK_UNASSIGNED')
    ORDER BY "taskId", "createdAt" DESC, "type" ASC, "id" DESC
)
UPDATE "Task" AS task
SET "assignedById" = assignment."actorId"
FROM latest_assignment AS assignment
WHERE task."id" = assignment."taskId"
  AND task."assigneeId" = assignment."userId"
  AND assignment."type" = 'TASK_ASSIGNED';
