import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEmployeeWorkspaceData } from "@/services/employee-workspace";
import EmployeeDashboard from "@/app/employee-dashboard";
import { getReviewPeriod, summarizeReviewQuality } from "@/lib/review-quality";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "MANAGER") redirect("/manager");
  const { tasks, feedback, profile } = await getEmployeeWorkspaceData(user.id);
  const quality = summarizeReviewQuality(feedback.map(review => ({ ...review, taskId: review.submission.task.id, employeeId: user.id })), getReviewPeriod());
  return <EmployeeDashboard name={user.name || user.email} designation={profile?.designation || "Team member"} tasks={tasks} quality={quality} feedback={feedback.map(review=>({id:review.id,feedback:review.feedback,rating:review.rating,reviewer:review.reviewer.name || review.reviewer.email,reviewerAvatarUrl:review.reviewer.avatarUrl,taskTitle:review.submission.task.title}))} />;
}
