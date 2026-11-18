import type { Prisma } from "@prisma/client";

export type DepartmentOption = { id: string; name: string };

export function resolveDepartmentFilter(value: string | string[] | undefined, departments: readonly DepartmentOption[]): string {
  return typeof value === "string" && (value === "UNASSIGNED" || departments.some(department => department.id === value)) ? value : "ALL";
}

export function matchesDepartment(departmentId: string | null | undefined, selectedDepartment: string): boolean {
  return selectedDepartment === "ALL" || !departmentId || departmentId === selectedDepartment;
}

export function departmentEmployeeWhere(selectedDepartment: string): Prisma.UserWhereInput {
  if (selectedDepartment === "ALL") return {};
  return { OR: [
    { employeeProfile: null },
    { employeeProfile: { departmentId: null } },
    ...(selectedDepartment === "UNASSIGNED" ? [] : [{ employeeProfile: { departmentId: selectedDepartment } }]),
  ] };
}

export function departmentTaskWhere(selectedDepartment: string): Prisma.TaskWhereInput {
  return selectedDepartment === "ALL" ? {} : { OR: [{ assigneeId: null }, { assignee: departmentEmployeeWhere(selectedDepartment) }] };
}

export function departmentHref(href: string, selectedDepartment: string): string {
  const url = new URL(href, "https://workspace.local");
  if (selectedDepartment === "ALL") url.searchParams.delete("department");
  else url.searchParams.set("department", selectedDepartment);
  return `${url.pathname}${url.search}${url.hash}`;
}
