type Task = { status: string; dueDate: Date | string | null };
type Review = { rating: number | null };
const terminal = new Set(["APPROVED", "DONE", "CANCELLED", "REJECTED"]);

export function summarizeEmployeeWork(tasks: readonly Task[], reviews: readonly Review[], today: string) {
  const ratings = reviews.flatMap(review => review.rating === null ? [] : [review.rating]);
  const completed = tasks.filter(task => task.status === "APPROVED" || task.status === "DONE").length;
  return {
    assigned: tasks.length,
    completed,
    pending: tasks.filter(task => !terminal.has(task.status)).length,
    inProgress: tasks.filter(task => task.status === "IN_PROGRESS").length,
    awaiting: tasks.filter(task => task.status === "SUBMITTED_FOR_REVIEW").length,
    overdue: tasks.filter(task => !terminal.has(task.status) && task.dueDate && new Date(task.dueDate).toISOString().slice(0,10) < today).length,
    completionRate: tasks.length ? Math.round(completed / tasks.length * 100) : null,
    reviewScore: ratings.length ? Math.round(ratings.reduce((sum,rating) => sum + rating,0) / ratings.length * 20) : null,
  };
}

export function employeeDayKey(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
