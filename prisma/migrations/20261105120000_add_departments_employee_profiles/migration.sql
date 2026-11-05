CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE');

CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "headId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT,
    "phone" TEXT,
    "designation" TEXT,
    "joiningDate" DATE,
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "departmentId" TEXT,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");
CREATE INDEX "Department_headId_idx" ON "Department"("headId");
CREATE UNIQUE INDEX "EmployeeProfile_userId_key" ON "EmployeeProfile"("userId");
CREATE UNIQUE INDEX "EmployeeProfile_employeeCode_key" ON "EmployeeProfile"("employeeCode");
CREATE INDEX "EmployeeProfile_departmentId_employmentStatus_idx" ON "EmployeeProfile"("departmentId", "employmentStatus");
CREATE INDEX "EmployeeProfile_managerId_idx" ON "EmployeeProfile"("managerId");

ALTER TABLE "Department" ADD CONSTRAINT "Department_headId_fkey"
FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_managerId_fkey"
FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
