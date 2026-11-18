CREATE TABLE "EmployeeLeaveDay" (
    "employeeId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeLeaveDay_pkey" PRIMARY KEY ("employeeId", "day"),
    CONSTRAINT "EmployeeLeaveDay_weekday_check" CHECK (EXTRACT(DOW FROM "day") <> 0)
);

ALTER TABLE "EmployeeLeaveDay" ADD CONSTRAINT "EmployeeLeaveDay_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
