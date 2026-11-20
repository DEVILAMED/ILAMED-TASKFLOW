export function companyTaskHref(role: string, _userId: string, taskId: string, _assigneeId: string | null, review = false) {
  const id = encodeURIComponent(taskId);
  if (review && (role === "ADMIN" || role === "MANAGER")) return `/reviews?task=${id}`;
  return `/company-tasks/${id}`;
}
