export function companyTaskHref(role: string, userId: string, taskId: string, assigneeId: string | null, review = false) {
  const id = encodeURIComponent(taskId);
  if (review && (role === "ADMIN" || role === "MANAGER")) return `/reviews?task=${id}`;
  if (role === "ADMIN") return `/admin?task=${id}`;
  if (role === "MANAGER" && assigneeId !== userId) return `/manager#task-${id}`;
  return `/company-tasks?task=${id}`;
}
