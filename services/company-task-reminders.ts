import { prisma } from "@/lib/prisma";
import { companyTaskAccessWhere } from "@/lib/company-task-access";
import { companyDigestDay, companyDigestSummary } from "@/lib/company-task-digest";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";

// Receipt and notification commit together; the composite key protects retries.
export async function dispatchCompanyTaskDigests(now = new Date()) {
  const dayKey = companyDigestDay(now);
  if (!dayKey) return;
  const day = new Date(`${dayKey}T00:00:00Z`);
  const eligible = { isBlocked: false, OR: [{ employeeProfile: null }, { employeeProfile: { employmentStatus: "ACTIVE" as const } }], leaveDays: { none: { day } } };
  const people = await prisma.user.findMany({ where: { ...eligible, companyDigestDeliveries: { none: { day } } }, orderBy: { id: "asc" }, take: 100, select: { id: true } });
  for (const person of people) {
    await prisma.$transaction(async tx => {
      const user = await tx.user.findFirst({ where: { id: person.id, ...eligible }, select: { id: true, role: true, leaveDays: { select: { day: true } } } });
      if (!user) return;
      const claim = await tx.companyDigestDelivery.createMany({ data: [{ userId: user.id, day }], skipDuplicates: true });
      if (!claim.count) return;
      const tasks = await tx.task.findMany({
        where: { projectId: COMPANY_TASK_PROJECT_ID, ...companyTaskAccessWhere(user), archivedAt: null, status: { notIn: ["APPROVED", "DONE", "CANCELLED", "REJECTED"] } },
        select: { id: true, status: true, assigneeId: true, startDate: true, dueDate: true, submissions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
      });
      const digest = companyDigestSummary(tasks, user, now, user.leaveDays.map(item => item.day.toISOString().slice(0, 10)));
      if (digest.message) await tx.notification.create({ data: { userId: user.id, type: "COMPANY_TASK_DIGEST", message: digest.message, href: digest.href } });
    });
  }
}
