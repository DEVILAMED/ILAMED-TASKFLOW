import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ReviewQueue from "./review-queue";
import WorkspacePageHeading from "@/app/workspace-page-heading";
import { getEmployeeWorkspaceData } from "@/services/employee-workspace";
import EmployeeApprovals from "@/app/employee-approvals";

export default async function ReviewsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "USER") {
    const { tasks, feedback } = await getEmployeeWorkspaceData(user.id);
    return <EmployeeApprovals tasks={tasks} feedback={feedback.map(review=>({id:review.id,taskId:review.submission.task.id,feedback:review.feedback,rating:review.rating,reviewer:review.reviewer.name || review.reviewer.email,createdAt:review.createdAt}))} />;
  }
  return <>
    <div className="workspace-view">
      <WorkspacePageHeading kicker="REVIEW QUEUE" title="Approvals" description="Tasks awaiting your review and sign-off." />
      <ReviewQueue />
    </div>
  </>;
}
