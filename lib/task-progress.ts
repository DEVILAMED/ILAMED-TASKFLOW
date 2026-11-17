export type ChecklistEntry = { isCompleted: boolean };

export function getChecklistProgress(items: readonly ChecklistEntry[] = []) {
  const total = items.length;
  const completed = items.filter((item) => item.isCompleted).length;
  return { completed, total, percentage: total ? Math.round(completed / total * 100) : 0 };
}
