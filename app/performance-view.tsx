import WorkspacePageHeading from "@/app/workspace-page-heading";
import { employeeDayKey, summarizeEmployeeWork } from "@/lib/employee-dashboard";

type Task = { id: string; status: string; priority: string; dueDate: Date | string | null; checklistItems: { isCompleted: boolean }[] };
type Review = { rating: number | null; decision: string; taskId: string };

export default function PerformanceView({ title, description, personal = false, tasks, reviews }: { title: string; description: string; personal?: boolean; tasks: Task[]; reviews: Review[] }) {
  const summary = summarizeEmployeeWork(tasks,reviews,employeeDayKey());
  const { completed, inProgress, awaiting, overdue, reviewScore: score } = summary;
  const approved = tasks.filter(task=>task.status==="APPROVED").length;
  const ratings = reviews.filter(review=>review.rating!==null);
  const percentage = (value:number) => tasks.length ? value/tasks.length*100 : 0;
  const steps = tasks.flatMap(task=>task.checklistItems);
  const dimensions = personal ? [
    {label:"Completion",value:percentage(completed)}, {label:"Review quality",value:score || 0}, {label:"Approved",value:percentage(approved)},
    {label:"In progress",value:percentage(inProgress)}, {label:"Awaiting review",value:percentage(awaiting)}, {label:"Checklist",value:steps.length?steps.filter(step=>step.isCompleted).length/steps.length*100:0},
  ] : [{label:"Completed",value:percentage(completed)},{label:"In progress",value:percentage(inProgress)},{label:"Awaiting",value:percentage(awaiting)},{label:"Approved",value:percentage(approved)},{label:"Reviewed",value:percentage(new Set(reviews.map(review=>review.taskId)).size)}];
  const coordinate = (index:number,radius:number) => { const angle=-Math.PI/2+index*2*Math.PI/dimensions.length;return [150+Math.cos(angle)*radius,145+Math.sin(angle)*radius]; };
  const points = (radius:number) => dimensions.map((_,index)=>coordinate(index,radius).join(",")).join(" ");
  const kpis = [["Assigned",tasks.length],["Completed",completed],["Submitted",awaiting],["Approved",approved],["Revisions",personal?reviews.filter(review=>review.decision==="REVISION_REQUESTED").length:tasks.filter(task=>task.status==="REVISION_REQUESTED").length],["On hold",tasks.filter(task=>task.status==="ON_HOLD").length],["High priority",tasks.filter(task=>task.priority==="HIGH").length],["In progress",inProgress]];
  return <div className={`workspace-view ${personal?"employee-performance":""}`}>
    <WorkspacePageHeading kicker="SCORECARD" title={title} description={description} />
    <div className="workspace-performance-grid">
      <section className="workspace-surface performance-score"><h2>100-Point Performance</h2><div className="performance-score-body"><div className="performance-ring"><svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="56" fill="none" stroke="var(--stroke)" strokeWidth="15"/><circle cx="70" cy="70" r="56" fill="none" stroke={personal?"#2443b3":"#5141d9"} strokeWidth="15" strokeDasharray={`${(score || 0)/100*352} 352`} transform="rotate(-90 70 70)"/></svg><strong>{score===null?"—":score}</strong></div><div><span className={`workspace-score-badge ${score!==null&&score>=70?"is-good":""}`}>{score===null?"Not rated":`${score} · ${score>=85?"Excellent":score>=70?"Good":"Needs review"}`}</span><p>{ratings.length} manager {ratings.length===1?"review":"reviews"}</p></div></div>
        {personal?<div className="employee-performance-bars">{dimensions.map(dimension=><div key={dimension.label}><div><span>{dimension.label}</span><strong>{Math.round(dimension.value)}%</strong></div><div className="employee-performance-track"><span style={{width:`${dimension.value}%`}}/></div></div>)}</div>:null}
        <p className="performance-explanation">Average review rating converted to a score out of 100.</p>
      </section>
      <section className="workspace-surface performance-radar"><h2>Dimension Radar</h2>{tasks.length?<svg viewBox="0 0 300 300" role="img" aria-label="Performance dimensions based on your actual task and review data">{[25,50,75,100].map(radius=><polygon key={radius} points={points(radius)} fill="none" stroke="var(--stroke)"/>)}{dimensions.map((dimension,index)=>{const point=coordinate(index,100),label=coordinate(index,122);return <g key={dimension.label}><line x1="150" y1="145" x2={point[0]} y2={point[1]} stroke="var(--stroke)"/><text x={label[0]} y={label[1]} textAnchor="middle" fill="var(--muted)" fontSize="9">{dimension.label}</text></g>;})}<polygon points={dimensions.map((dimension,index)=>coordinate(index,dimension.value).join(",")).join(" ")} fill="#2443b32b" stroke="#2443b3" strokeWidth="2"/></svg>:<p className="workspace-chart-placeholder">Task activity will appear here as work is assigned.</p>}</section>
    </div>
    <section className="workspace-surface"><h2>Role-Specific KPIs</h2><div className="workspace-kpi-grid">{kpis.map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
    <section className="workspace-surface"><h2>Activity Summary</h2><div className="workspace-activity-summary">{[["Total tasks",tasks.length],["Completed",completed],["Awaiting review",awaiting],["Overdue",overdue]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
  </div>;
}
