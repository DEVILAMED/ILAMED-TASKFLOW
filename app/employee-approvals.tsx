import Link from "next/link";
import WorkspacePageHeading from "@/app/workspace-page-heading";

type ApprovalTask = { id: string; title: string; description: string | null; status: string };
type Feedback = { id: string; taskId: string; feedback: string; rating: number | null; reviewer: string; createdAt: Date | string };
const labels: Record<string,string> = { SUBMITTED_FOR_REVIEW:"Awaiting review", APPROVED:"Approved", DONE:"Completed", REVISION_REQUESTED:"Revision requested", REJECTED:"Reviewed" };

export default function EmployeeApprovals({ tasks, feedback }: { tasks: ApprovalTask[]; feedback: Feedback[] }) {
  const submitted = tasks.filter(task=>task.status in labels).sort((a,b)=>Number(b.status==="SUBMITTED_FOR_REVIEW")-Number(a.status==="SUBMITTED_FOR_REVIEW"));
  return <div className="workspace-view"><WorkspacePageHeading kicker="REVIEW QUEUE" title="Approvals" description="Track your submitted work and manager feedback." />
    {submitted.length ? <section className="employee-approvals-list" aria-label="My submitted work">{submitted.map(task=>{const review=feedback.find(item=>item.taskId===task.id);return <article key={task.id} className="workspace-surface"><div className="employee-approval-heading"><div><h2>{task.title}</h2>{task.description?<p>{task.description}</p>:null}</div><span className={`employee-task-status status-${task.status.toLowerCase()}`}>{labels[task.status]}</span></div>{review?<div className="employee-review-feedback"><p>{review.feedback}</p><small>{review.reviewer}{review.rating!==null?` · ${review.rating}/5`:""} · {new Date(review.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"Asia/Kolkata"})}</small></div>:<p className="employee-awaiting-copy">Your manager will review this submission.</p>}<Link href={`/company-tasks?task=${encodeURIComponent(task.id)}`} className="employee-open-task">Open task →</Link></article>;})}</section>:<p className="workspace-empty-panel">No submitted work to review yet.</p>}
  </div>;
}
