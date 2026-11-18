CREATE TABLE "CompanyTaskRecurrence" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "checklistItems" JSONB NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdById" TEXT,
    CONSTRAINT "CompanyTaskRecurrence_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Task" ADD COLUMN "recurrenceId" TEXT, ADD COLUMN "recurrenceDate" DATE;
CREATE UNIQUE INDEX "Task_recurrenceId_recurrenceDate_key" ON "Task"("recurrenceId", "recurrenceDate");
CREATE INDEX "CompanyTaskRecurrence_isActive_nextDate_idx" ON "CompanyTaskRecurrence"("isActive", "nextDate");
CREATE INDEX "CompanyTaskRecurrence_assigneeId_idx" ON "CompanyTaskRecurrence"("assigneeId");

ALTER TABLE "Task" ADD CONSTRAINT "Task_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "CompanyTaskRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyTaskRecurrence" ADD CONSTRAINT "CompanyTaskRecurrence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyTaskRecurrence" ADD CONSTRAINT "CompanyTaskRecurrence_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyTaskRecurrence" ADD CONSTRAINT "CompanyTaskRecurrence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
