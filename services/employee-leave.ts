import { prisma } from "@/lib/prisma";
import type { LeaveDaysByEmployee } from "@/lib/company-workdays";

export async function getEmployeeLeave(employeeIds: readonly string[]): Promise<LeaveDaysByEmployee> {
  if (!employeeIds.length) return {};
  const days = await prisma.employeeLeaveDay.findMany({
    where: { employeeId: { in: [...new Set(employeeIds)] } },
    select: { employeeId: true, day: true },
    orderBy: { day: "desc" },
  });
  const byEmployee = new Map<string, string[]>();
  for (const { employeeId, day } of days) {
    const dates = byEmployee.get(employeeId) ?? [];
    dates.push(day.toISOString().slice(0, 10));
    byEmployee.set(employeeId, dates);
  }
  return Object.fromEntries(byEmployee);
}

export function getLeaveForTasks(tasks: readonly { assigneeId?: string | null }[]) {
  return getEmployeeLeave(tasks.flatMap(task => task.assigneeId ? [task.assigneeId] : []));
}
