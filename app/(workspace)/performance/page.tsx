import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { companyReportingEmployeeIds } from "@/services/workspace-reporting";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import { getReviewEvidence } from "@/services/review-quality";
import { getReviewPeriod, summarizeReviewQuality } from "@/lib/review-quality";
import PerformanceView from "@/app/performance-view";
import { USER_IDENTITY_SELECT, userAvatarUrl } from "@/lib/user-avatar";

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ employee?: string; period?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const memberIds = await companyReportingEmployeeIds(user);
  const personal = user.role === "USER";
  const target = personal ? user.id : params.employee;
  if (target && memberIds && !memberIds.includes(target)) notFound();
  const period = getReviewPeriod(params.period);
  const employeeIds = target ? [target] : memberIds;
  const [tasks, reviews, employee] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: COMPANY_TASK_PROJECT_ID, ...(employeeIds === undefined ? {} : { assigneeId: { in: employeeIds } }) },
      select: { status: true, priority: true, dueDate: true, assigneeId: true },
    }),
    getReviewEvidence(period, employeeIds),
    target ? prisma.user.findUnique({ where: { id: target }, select: { ...USER_IDENTITY_SELECT, employeeProfile: { select: { designation: true } } } }) : null,
  ]);
  if (target && !employee) notFound();
  return <PerformanceView personal={personal} employee={target} period={period} quality={summarizeReviewQuality(reviews, period)}
    title={employee ? employee.name || employee.email : "Team Performance"}
    avatarUrl={employee ? userAvatarUrl(employee.id, employee.avatar) : null}
    description={personal ? employee?.employeeProfile?.designation || "My Performance" : "Manager review quality and current task activity."}
    tasks={tasks} reviews={reviews} />;
}
