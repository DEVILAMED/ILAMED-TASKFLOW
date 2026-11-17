import { getChecklistProgress, type ChecklistEntry } from "@/lib/task-progress";

export default function TaskChecklistProgress({ items, title, className = "" }: {
  items: readonly ChecklistEntry[];
  title: string;
  className?: string;
}) {
  const { completed, total, percentage } = getChecklistProgress(items);
  if (!total) return <span className={`block text-xs text-[var(--muted)] ${className}`}>No checklist</span>;

  return <span className={`task-checklist-progress grid gap-1.5 ${className}`}>
    <span className="flex items-center justify-between gap-2 text-[11px]">
      <strong className="font-semibold tabular-nums text-[var(--foreground)]">{percentage}%</strong>
      <span className="whitespace-nowrap tabular-nums text-[var(--muted)]">{completed}/{total} done</span>
    </span>
    <span role="progressbar" aria-label={`Checklist completion for ${title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={`${completed} of ${total} checklist items completed (${percentage}%)`} className="block h-1.5 overflow-hidden rounded-full bg-[var(--stroke)]">
      <span className={`block h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none ${completed === total ? "bg-emerald-600" : "bg-[var(--accent)]"}`} style={{ width: `${percentage}%` }} />
    </span>
  </span>;
}
