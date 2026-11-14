import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { companyReportingScope } from "@/services/workspace-reporting";
import PerformanceView from "@/app/performance-view";

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ employee?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { employee } = await searchParams;
  const scope = await companyReportingScope(user);
  const personal = user.role === "USER";
  const target = personal ? user.id : employee;
  const where = target ? { AND: [scope, { assigneeId: target }] } : scope;
  const [tasks,reviews,profile] = await Promise.all([
    prisma.task.findMany({ where, select: { id:true,status:true,priority:true,dueDate:true,assignee:{select:{name:true,email:true}},checklistItems:{select:{isCompleted:true}} } }),
    prisma.taskReview.findMany({ where: { submission:{task:where} },select:{rating:true,decision:true,submission:{select:{taskId:true}}} }),
    prisma.employeeProfile.findUnique({where:{userId:user.id},select:{designation:true}}),
  ]);
  return <PerformanceView personal={personal} title={personal?user.name || user.email:employee?tasks[0]?.assignee?.name || tasks[0]?.assignee?.email || "Employee performance":"Team Performance"} description={personal?profile?.designation || "My Performance":"Review quality and task activity across your workspace."} tasks={tasks} reviews={reviews.map(review=>({rating:review.rating,decision:review.decision,taskId:review.submission.taskId}))}/>;
}
