import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEmployeeWorkspaceData } from "@/services/employee-workspace";
import EmployeeDashboard from "@/app/employee-dashboard";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "MANAGER") redirect("/manager");
  const { tasks, feedback, profile } = await getEmployeeWorkspaceData(user.id);
  return <EmployeeDashboard name={user.name || user.email} designation={profile?.designation || "Team member"} tasks={tasks} feedback={feedback.map(review=>({id:review.id,feedback:review.feedback,rating:review.rating,reviewer:review.reviewer.name || review.reviewer.email,taskTitle:review.submission.task.title}))} />;
}
