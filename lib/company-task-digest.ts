import { companyTaskSchedule, employeeDayKey, isCompanyTaskOverdue, isCompanyWorkday } from "./company-workdays.ts";
import { nextCalendarDay } from "./company-task-repeat.ts";

export type DigestTask = { id: string; status: string; assigneeId: string | null; startDate: Date | string | null; dueDate: Date | string | null; submissions: { createdAt: Date | string }[] };
export function companyDigestDay(now: Date) {
  const india = new Date(now.getTime() + 330 * 60_000);
  const day = employeeDayKey(now);
  return india.getUTCHours() >= 9 && isCompanyWorkday(day) ? day : null;
}

export function companyDigestSummary(tasks: readonly DigestTask[], user: { id: string; role: string }, now: Date, leaveDays: readonly string[]) {
  const today = employeeDayKey(now);
  let nextWorkday = nextCalendarDay(today);
  while (!isCompanyWorkday(nextWorkday, leaveDays)) nextWorkday = nextCalendarDay(nextWorkday);
  let dueToday = 0, upcoming = 0, overdue = 0, pendingReviews = 0;
  for (const task of tasks) {
    if (["APPROVED", "DONE", "CANCELLED", "REJECTED"].includes(task.status)) continue;
    if (task.assigneeId === user.id && !["SUBMITTED_FOR_REVIEW", "ON_HOLD"].includes(task.status)) {
      const schedule = companyTaskSchedule(task, leaveDays);
      if (schedule.dueDate === today) dueToday++;
      else if (schedule.dueDate === nextWorkday) upcoming++;
      if (isCompanyTaskOverdue(task, today, { [user.id]: leaveDays })) overdue++;
    }
    if (user.role !== "USER" && task.assigneeId !== user.id && task.status === "SUBMITTED_FOR_REVIEW") {
      const submitted = task.submissions[0]?.createdAt;
      if (submitted && new Date(submitted).getTime() <= now.getTime() - 86_400_000) pendingReviews++;
    }
  }
  const parts = [dueToday ? `${dueToday} due today` : "", upcoming ? `${upcoming} due next working day` : "", overdue ? `${overdue} overdue` : "", pendingReviews ? `${pendingReviews} submissions waiting over 24 hours for your review` : ""].filter(Boolean);
  return { dueToday, upcoming, overdue, pendingReviews, message: parts.length ? `Daily task digest (${today}): ${parts.join("; ")}.` : null,
    href: pendingReviews ? "/reviews?sort=oldest" : user.role === "ADMIN" ? "/admin" : "/company-tasks?focus=ACTIVE" };
}
