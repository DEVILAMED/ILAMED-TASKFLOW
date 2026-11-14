-- The review workflow introduced these values in Prisma without extending the
-- database notification enum. Preserve existing notifications and deployments
-- where any of these values have already been added.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_REVISION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_REJECTED';
