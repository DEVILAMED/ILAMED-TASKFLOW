import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, Clock3, ListChecks, Star, TriangleAlert } from "lucide-react";
import WorkspacePageHeading from "@/app/workspace-page-heading";
import { summarizeEmployeeWork, employeeDayKey } from "@/lib/employee-dashboard";

type Task = { id: string; title: string; status: string; dueDate: Date | string | null };
type Feedback = { id: string; feedback: string; rating: number | null; reviewer: string; taskTitle: string };

export default function EmployeeDashboard({ name, designation, tasks, feedback }: { name: string; designation: string; tasks: Task[]; feedback: Feedback[] }) {
  const summary = summarizeEmployeeWork(tasks, feedback, employeeDayKey());
  const metrics = [
    { label: "Assigned", value: summary.assigned, icon: ListChecks, href: "/company-tasks", tone: "assigned" },
    { label: "In progress", value: summary.inProgress, icon: Clock3, href: "/company-tasks?status=IN_PROGRESS", tone: "progress" },
    { label: "Awaiting review", value: summary.awaiting, icon: ClipboardCheck, href: "/reviews", tone: "awaiting" },
    { label: "Overdue", value: summary.overdue, icon: TriangleAlert, href: "/company-tasks?focus=OVERDUE", tone: "overdue" },
    { label: "Completed", value: summary.completed, icon: CheckCircle2, href: "/company-tasks?focus=COMPLETED", tone: "completed" },
    { label: "Review score", value: summary.reviewScore ?? "—", icon: Star, href: "/performance", tone: "assigned" },
  ];
  const upcoming = tasks.filter(task => task.dueDate && !["APPROVED","DONE","CANCELLED","REJECTED"].includes(task.status)).sort((a,b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()).slice(0,5);
  const rows = [{label:"Not started",count:tasks.filter(task=>["TODO","ACCEPTED"].includes(task.status)).length,color:"#2443b3"},{label:"In progress",count:summary.inProgress,color:"#2860ee"},{label:"Awaiting review",count:summary.awaiting,color:"#8a55d9"},{label:"Completed",count:summary.completed,color:"#11958d"},{label:"Other work",count:tasks.filter(task=>["ON_HOLD","REVISION_REQUESTED","CANCELLED","REJECTED"].includes(task.status)).length,color:"#a9b5c9"}];
  const circumference = 2*Math.PI*62;
  return <div className="workspace-view employee-dashboard">
    <WorkspacePageHeading kicker="MY WORKSPACE" title={`Welcome back, ${name.split(/\s+/)[0]}`} description={`${designation} · Your work, deadlines, and progress at a glance.`} action={<Link href="/company-tasks" className="accent-button workspace-standard-button">View my tasks <ArrowRight size={14}/></Link>} />
    <section className="employee-dashboard-stats" aria-label="My task summary">{metrics.map(({label,value,icon:Icon,href,tone})=><Link href={href} key={label} className={`employee-summary-card metric-${tone}`}><div><span>{label}</span><strong>{value}</strong></div><Icon size={19} strokeWidth={1.7} aria-hidden="true"/></Link>)}</section>
    <section className="employee-dashboard-panels">
      <article className="workspace-surface"><div className="employee-panel-heading"><h2>Upcoming deadlines</h2><Link href="/company-tasks?view=calendar">VIEW CALENDAR <ArrowRight size={12}/></Link></div>{upcoming.length?<div className="employee-deadlines">{upcoming.map(task=><Link key={task.id} href={`/company-tasks?task=${encodeURIComponent(task.id)}`}><div><strong>{task.title}</strong><span>{task.status.replaceAll("_"," ").toLowerCase()}</span></div><time dateTime={new Date(task.dueDate!).toISOString()}>{new Date(task.dueDate!).toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"})}</time></Link>)}</div>:<p className="employee-dashboard-empty">No upcoming deadlines. You’re all caught up.</p>}</article>
      <article className="workspace-surface"><h2>My task distribution</h2><div className="employee-task-distribution"><svg viewBox="0 0 180 180" role="img" aria-label={rows.map(row=>`${row.label}: ${row.count}`).join(", ")}><circle cx="90" cy="90" r="62" fill="none" stroke="var(--stroke)" strokeWidth="24"/>{rows.filter(row=>row.count>0).map((row,index,array)=><circle key={row.label} cx="90" cy="90" r="62" fill="none" stroke={row.color} strokeWidth="24" transform="rotate(-90 90 90)" strokeDasharray={`${Math.max(0,row.count/summary.assigned*circumference-(array.length>1?3:0))} ${circumference}`} strokeDashoffset={-array.slice(0,index).reduce((sum,item)=>sum+item.count,0)/summary.assigned*circumference}><title>{`${row.label}: ${row.count}`}</title></circle>)}</svg><div>{rows.map(row=><p key={row.label}><i style={{background:row.color}}/><span>{row.label}</span><strong>{row.count}</strong></p>)}</div></div></article>
    </section>
    <section className="workspace-surface"><div className="employee-panel-heading"><h2>Recent manager feedback</h2><Link href="/reviews">VIEW APPROVALS <ArrowRight size={12}/></Link></div>{feedback.length?<div className="employee-feedback-grid">{feedback.slice(0,4).map(review=><article key={review.id}><div><h3>{review.taskTitle}</h3>{review.rating!==null?<span>{review.rating}/5</span>:null}</div><p>{review.feedback}</p><small>{review.reviewer}</small></article>)}</div>:<p className="employee-dashboard-empty">Feedback will appear here after your manager reviews submitted work.</p>}</section>
  </div>;
}
