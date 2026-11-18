import WorkspacePageHeading from "@/app/workspace-page-heading";
import { employeeDayKey, summarizeEmployeeWork } from "@/lib/employee-dashboard";
import { MIN_REVIEWED_TASKS, REVIEW_PERIODS, REVIEW_RUBRIC, type ReviewEvidenceDetail, type ReviewPeriod, type ReviewQualitySummary } from "@/lib/review-quality";
import ReviewQualityBadge from "@/app/review-quality-badge";
import UserAvatar from "@/app/user-avatar";

type Task = { status: string; priority: string; dueDate: Date | string | null; assigneeId: string | null };

export default function PerformanceView({ title, description, personal = false, employee, tasks, quality, period, reviews, avatarUrl }: {
  title: string;
  description: string;
  personal?: boolean;
  avatarUrl?: string | null;
  employee?: string;
  tasks: Task[];
  quality: ReviewQualitySummary;
  period: ReviewPeriod;
  reviews: ReviewEvidenceDetail[];
}) {
  const summary = summarizeEmployeeWork(tasks, employeeDayKey());
  const isTeam = !employee;
  const { score } = quality;
  const latestReviewIds = new Set(quality.latestReviewIds);
  const evidence = reviews.filter(review => latestReviewIds.has(review.id)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const population = new Set([...tasks.flatMap(task => task.assigneeId ? [task.assigneeId] : []), ...quality.employees.map(person => person.employeeId)]).size;
  const distribution = [
    { label: "Not started", count: tasks.filter(task => ["TODO", "ACCEPTED"].includes(task.status)).length },
    { label: "In progress", count: summary.inProgress },
    { label: "Awaiting review", count: summary.awaiting },
    { label: "Revisions requested", count: tasks.filter(task => task.status === "REVISION_REQUESTED").length },
    { label: "On hold", count: tasks.filter(task => task.status === "ON_HOLD").length },
    { label: "Completed", count: summary.completed },
    { label: "Other closed", count: tasks.filter(task => ["CANCELLED", "REJECTED"].includes(task.status)).length },
  ];
  const kpis = [["Assigned", tasks.length], ["Completed", summary.completed], ["Awaiting review", summary.awaiting],
    ["Approved", tasks.filter(task => task.status === "APPROVED").length], ["Revisions requested", distribution[3].count],
    ["On hold", distribution[4].count], ["High priority", tasks.filter(task => task.priority === "HIGH").length], ["Overdue open", summary.overdue]];

  return <div className={`workspace-view ${personal ? "employee-performance" : ""}`}>
    <WorkspacePageHeading kicker="WORK QUALITY & ACTIVITY" title={title} description={description} action={employee ? <UserAvatar name={title} src={avatarUrl} size={48} /> : undefined} />
    <section className="workspace-surface performance-period">
      <div><h2>Review period</h2><p>{period.startDay} to {period.endDay} · India time</p></div>
      <form action="/performance" method="get">
        {employee ? <input type="hidden" name="employee" value={employee} /> : null}
        <label className="workspace-field">Review window<select name="period" defaultValue={period.value} className="soft-input">{REVIEW_PERIODS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <button type="submit" className="secondary-button workspace-standard-button">Apply</button>
      </form>
    </section>
    <div className="workspace-performance-grid">
      <section className="workspace-surface performance-score">
        <h2>{isTeam ? "Team review quality" : "Manager review quality"}</h2>
        <div className="performance-score-body">
          <div className="performance-ring">
            <svg viewBox="0 0 140 140" aria-hidden="true">
              <circle cx="70" cy="70" r="56" fill="none" stroke="var(--stroke)" strokeWidth="15" />
              {score !== null ? <circle cx="70" cy="70" r="56" fill="none" stroke="var(--accent)" strokeWidth="15" strokeDasharray={`${score / 100 * 2 * Math.PI * 56} ${2 * Math.PI * 56}`} transform="rotate(-90 70 70)" /> : null}
            </svg>
            <strong aria-label={score === null ? quality.label : `${score} out of 100`}>{score ?? "—"}</strong>
          </div>
          <div>
            <ReviewQualityBadge score={score} ratedTaskCount={quality.ratedTaskCount} />
            <p>{quality.ratedTaskCount} reviewed {quality.ratedTaskCount === 1 ? "task" : "tasks"} · {quality.reviewCount} rated reviews</p>
          </div>
        </div>
        <p className="performance-explanation">{isTeam
          ? `Equal average of employees with at least ${MIN_REVIEWED_TASKS} distinct reviewed tasks each. Each employee contributes equally, regardless of review volume.`
          : `Latest rated review per task, averaged and multiplied by 20. At least ${MIN_REVIEWED_TASKS} distinct reviewed tasks in this period are needed for a score.`}</p>
        {isTeam ? <p className="performance-explanation"><strong>{quality.eligibleEmployeeCount} of {population} employees</strong> with assigned or reviewed work have enough evidence. The score includes {quality.contributingTaskCount} task assessments from those employees; everyone else is excluded.</p>
          : score === null ? <p className="performance-explanation">{quality.ratedTaskCount ? `${Math.max(0, MIN_REVIEWED_TASKS - quality.ratedTaskCount)} more distinct reviewed tasks needed.` : "No rated work in this period."}</p> : null}
        <p className="performance-explanation">{quality.revisionCount} revision requests in this period. Review history remains available; revisions do not give a task extra weight.</p>
      </section>
      <section className="workspace-surface performance-activity">
        <h2>Current task distribution</h2>
        <p className="performance-context">Snapshot of all assigned work. Task status describes activity and does not contribute to the quality score.</p>
        {tasks.length ? <div className="employee-performance-bars">{distribution.map(row => <div key={row.label}>
          <div><span>{row.label}</span><strong>{row.count} · {Math.round(row.count / tasks.length * 100)}%</strong></div>
          <div className="employee-performance-track"><span style={{ width: `${row.count / tasks.length * 100}%` }} /></div>
        </div>)}</div> : <p className="workspace-chart-placeholder">Task activity will appear here as work is assigned.</p>}
      </section>
    </div>
    <section className="workspace-surface"><h2>Current task totals</h2><div className="workspace-kpi-grid">{kpis.map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <p className="performance-context">Overdue counts open tasks past their current due date. Delivery reliability also depends on agreed deadlines, scope changes, and blockers; it is assessed separately.</p>
    </section>
    <section className="workspace-surface performance-methodology">
      <details><summary>View review evidence ({evidence.length} task assessments)</summary>
        <p className="performance-context">Latest rated review per task and submitter in this period. {isTeam ? `Employees with fewer than ${MIN_REVIEWED_TASKS} reviewed tasks are included here for context and excluded from the team score.` : "Earlier reviews remain in your feedback history."}</p>
        {evidence.length ? <div className="performance-evidence"><table>
          <caption className="sr-only">Review evidence for the selected period; dates are in India time.</caption>
          <thead><tr><th scope="col">Task and evidence</th>{isTeam ? <th scope="col">Employee</th> : null}<th scope="col">Rating</th><th scope="col">Reviewed</th></tr></thead>
          <tbody>{evidence.map(review => <tr key={review.id}>
            <td><strong>{review.taskTitle}</strong><p>{review.feedback}</p><small>{review.decision.replaceAll("_", " ").toLowerCase()} · {review.reviewerName}</small></td>
            {isTeam ? <td><span className="user-identity"><UserAvatar name={review.employeeName} src={review.employeeAvatarUrl} size={24} />{review.employeeName}</span></td> : null}
            <td>{review.rating}/5</td><td><time dateTime={new Date(review.createdAt).toISOString()}>{dateFormatter.format(new Date(review.createdAt))}</time></td>
          </tr>)}</tbody>
        </table></div> : <p className="performance-context">No rated reviews in this period.</p>}
      </details>
    </section>
    <section className="workspace-surface performance-methodology">
      <h2>How to interpret review quality</h2>
      <p>Ratings assess work against its agreed acceptance criteria. Work is credited to the person who submitted it, even after reassignment. Only the latest rated review for each task and submitter within the selected period counts.</p>
      <p>Scores are rounded to a whole number. Bands: 90–100 Excellent; 80–89 Good; 60–79 Meets requirements; below 60 Needs review. Fewer than {MIN_REVIEWED_TASKS} distinct tasks means limited evidence.</p>
      <details><summary>Quality rating criteria</summary><ol>{REVIEW_RUBRIC.map(item => <li key={item.rating}><strong>{item.rating}/5 · {item.label}.</strong> {item.description}</li>)}</ol></details>
      <p>Use this indicator alongside role-specific goals, task complexity, delivery outcomes, dependencies, and employee feedback. Managers should compare evidence and align their use of the criteria before comparing employees. Earlier ratings may predate these criteria.</p>
    </section>
  </div>;
}
