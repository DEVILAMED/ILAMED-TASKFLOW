import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { companyTaskAccessWhere } from "@/lib/company-task-access";
import { companyTaskRepeatSelect, serializeTaskRepeat } from "@/lib/company-task-repeat";
import { USER_IDENTITY_SELECT, withAvatarUrl } from "@/lib/user-avatar";
import { COMPANY_TASK_PROJECT_ID } from "@/services/company-tasks";
import { ensureDailyCompanyTasks } from "@/services/recurring-company-tasks";
import { getEmployeeLeave } from "@/services/employee-leave";
import CompanyTaskBoard from "../company-task-board";

export default async function TaskDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await ensureDailyCompanyTasks();
  const { id } = await params;
  const access = { projectId: COMPANY_TASK_PROJECT_ID, ...companyTaskAccessWhere(user) };
  const selected = await prisma.task.findFirst({ where: { ...access, id }, select: { recurrenceId: true } });
  if (!selected) notFound();
  const [tasks, employees] = await Promise.all([
    prisma.task.findMany({
      where: { ...access, ...(selected.recurrenceId ? { recurrenceId: selected.recurrenceId } : { id }) },
      select: {
        ...companyTaskRepeatSelect,
        id: true, title: true, description: true, status: true, priority: true,
        startDate: true, dueDate: true, createdAt: true, updatedAt: true,
        assignee: { select: USER_IDENTITY_SELECT },
        assignedBy: { select: { id: true, name: true, email: true } },
        checklistItems: { orderBy: { position: "asc" }, select: { id: true, title: true, isCompleted: true, position: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    user.role === "ADMIN" ? prisma.user.findMany({
      where: { role: { not: "ADMIN" }, isBlocked: false, OR: [{ employeeProfile: null }, { employeeProfile: { employmentStatus: { not: "INACTIVE" } } }] },
      select: { id: true, name: true, email: true }, orderBy: [{ name: "asc" }, { email: "asc" }],
    }) : [],
  ]);
  const leaveByEmployee = await getEmployeeLeave(tasks.flatMap(task => task.assignee ? [task.assignee.id] : []));
  const feedback = await prisma.taskReview.findMany({
    where: { submission: { taskId: { in: tasks.map(task => task.id) } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, feedback: true, rating: true, reviewer: { select: { name: true, email: true } }, submission: { select: { taskId: true } } },
  });
  return <CompanyTaskBoard detailTaskId={id} isAdmin={user.role === "ADMIN"} employeeId={user.id} employees={employees} leaveByEmployee={leaveByEmployee}
    initialFeedback={feedback.map(review => ({ id: review.id, taskId: review.submission.taskId, feedback: review.feedback, rating: review.rating, reviewer: review.reviewer.name || review.reviewer.email }))}
    initialTasks={tasks.map(task => ({ ...serializeTaskRepeat(task), assignee: task.assignee ? withAvatarUrl(task.assignee) : null,
      startDate: task.startDate?.toISOString() ?? null, dueDate: task.dueDate?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString(),
    }))} />;
}
