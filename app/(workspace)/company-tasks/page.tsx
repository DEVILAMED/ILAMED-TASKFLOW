import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEmployeeWorkspaceData } from "@/services/employee-workspace";
import WorkspacePageHeading from "@/app/workspace-page-heading";
import CompanyTaskBoard from "./company-task-board";

export default async function CompanyTasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");
  const calendar = (await searchParams).view === "calendar";
  const { tasks, feedback } = await getEmployeeWorkspaceData(user.id);
  return <div className="workspace-view">
    <WorkspacePageHeading kicker={calendar ? "TIMELINE" : "WORKFLOW"} title={calendar ? "Calendar" : "Tasks"} />
    <CompanyTaskBoard isAdmin={false} employees={[]}
      initialFeedback={feedback.map(review => ({ id: review.id, taskId: review.submission.task.id, feedback: review.feedback, rating: review.rating, reviewer: review.reviewer.name || review.reviewer.email }))}
      initialTasks={tasks.map(task => ({ ...task, dueDate: task.dueDate?.toISOString() ?? null, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() }))}
    />
  </div>;
}
