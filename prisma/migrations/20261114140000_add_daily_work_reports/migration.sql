CREATE TABLE "DailyWorkReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "completedWork" TEXT NOT NULL,
    "nextSteps" TEXT,
    "blockers" TEXT,
    "minutesWorked" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyWorkReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DailyWorkReport_minutesWorked_check" CHECK ("minutesWorked" IS NULL OR "minutesWorked" BETWEEN 0 AND 1440)
);

CREATE UNIQUE INDEX "DailyWorkReport_userId_reportDate_key" ON "DailyWorkReport"("userId", "reportDate");

ALTER TABLE "DailyWorkReport" ADD CONSTRAINT "DailyWorkReport_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
