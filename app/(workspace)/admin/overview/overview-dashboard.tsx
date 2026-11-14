import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, Clock3, Plus, TrendingUp, TriangleAlert, UsersRound } from "lucide-react";
import { NewTaskButton } from "@/app/new-company-task-dialog";

export type OverviewEmployee = {
  id: string;
  name: string;
  email: string;
  designation: string;
  departmentId: string | null;
  departmentName: string;
  assigned: number;
  active: number;
  inProgress: number;
  awaiting: number;
  completed: number;
  overdue: number;
  reviewScore?: number | null;
};

type OverviewDashboardProps = {
  dateLabel?: string;
  employees: OverviewEmployee[];
  departments: { id: string; name: string }[];
  counts: { employees: number; createdToday: number; inProgress: number; awaiting: number; overdue: number; completed: number; total: number };
  distribution: { label: string; count: number; color: string; href: string }[];
};

function WorkloadChart({ employees }: { employees: OverviewEmployee[] }) {
  const rows = employees.slice(0, 8);
  const max = Math.max(1, ...rows.map((person) => person.assigned));
  const baseline = 231;
  const height = 215;
  const column = 840 / Math.max(rows.length, 1);
  const barWidth = Math.min(44, column * 0.38);
  if (!rows.length) return <div className="overview-chart-empty"><UsersRound size={26} strokeWidth={1.4} /><p>No employee tasks to display.</p><Link href="/admin/employees">Manage your team <ArrowRight size={12} /></Link></div>;
  return <div className="overview-workload-scroll"><svg viewBox="0 0 900 258" preserveAspectRatio="none" role="img" aria-label="Assigned and completed tasks per employee">
    {[0, 1, 2, 3, 4].map((index) => <text key={index} x="52" y={baseline - index * height / 4 + 4} textAnchor="end" fill="var(--muted)" fontSize="11">{Number((index * max / 4).toFixed(2))}</text>)}
    {rows.map((person, index) => {
      const x = 72 + index * column;
      const assignedHeight = person.assigned / max * height;
      const completedHeight = person.completed / max * height;
      const shortName = person.name.split(/\s+/)[0];
      return <g key={person.id}>
        <title>{`${person.name}: ${person.assigned} assigned, ${person.completed} completed`}</title>
        {assignedHeight > 0 ? <path d={`M${x},${baseline}V${baseline - assignedHeight + 4}q0,-4 4,-4h${barWidth - 8}q4,0 4,4V${baseline}Z`} fill="#2443b3" /> : null}
        {completedHeight > 0 ? <path d={`M${x + barWidth + 4},${baseline}V${baseline - completedHeight + 4}q0,-4 4,-4h${barWidth - 8}q4,0 4,4V${baseline}Z`} fill="#7d39eb" /> : null}
        <text x={x + barWidth} y="245" textAnchor="middle" fill="var(--muted)" fontSize="11">{shortName.length > 12 ? `${shortName.slice(0, 11)}…` : shortName}</text>
      </g>;
    })}
  </svg></div>;
}

function StatusChart({ distribution, total }: Pick<OverviewDashboardProps, "distribution"> & { total: number }) {
  const circumference = 2 * Math.PI * 66;
  const visible = distribution.filter((item) => item.count > 0);
  return <div className="overview-status-body"><svg viewBox="0 0 200 200" role="img" aria-label={total ? distribution.map((item) => `${item.label}: ${item.count}`).join(", ") : "No tasks yet"}>
    <circle cx="100" cy="100" r="66" stroke="var(--panel-soft)" strokeWidth="33" fill="none" />
    {visible.map((item, index) => {
      const offset = visible.slice(0, index).reduce((sum, row) => sum + row.count, 0) / total * circumference;
      const length = item.count / total * circumference;
      return <Link key={item.label} href={item.href} aria-label={`${item.label}: ${item.count} tasks`}><circle cx="100" cy="100" r="66" fill="none" stroke={item.color} strokeWidth="33" strokeDasharray={`${Math.max(0, length - (visible.length > 1 ? 4 : 0))} ${circumference}`} strokeDashoffset={-offset} transform="rotate(-60 100 100)"><title>{`${item.label}: ${item.count}`}</title></circle></Link>;
    })}
  </svg></div>;
}

export default function OverviewDashboard({ employees, counts, distribution }: OverviewDashboardProps) {
  const metrics = [
    { label: "Employees", value: counts.employees, icon: TrendingUp, tone: "employees", href: "/admin/employees" },
    { label: "Created today", value: counts.createdToday, icon: Plus, tone: "created", href: "/admin?focus=CREATED_TODAY" },
    { label: "In progress", value: counts.inProgress, icon: Clock3, tone: "progress", href: "/admin?status=IN_PROGRESS" },
    { label: "Awaiting", value: counts.awaiting, icon: ClipboardCheck, tone: "awaiting", href: "/reviews" },
    { label: "Overdue", value: counts.overdue, icon: TriangleAlert, tone: "overdue", href: "/admin?focus=OVERDUE" },
    { label: "Completed", value: counts.completed, icon: CheckCircle2, tone: "completed", href: "/admin?focus=COMPLETED" },
  ];

  return <div className="overview-dashboard">
    <section className="overview-page-heading">
      <div><p className="overview-eyebrow">COMMAND CENTER</p><h1>Team Operations Dashboard</h1><p className="overview-description">Live overview of every employee, task and approval.</p></div>
      <NewTaskButton className="overview-new-task" />
    </section>
    <section aria-label="Company totals" className="overview-metrics">
      {metrics.map(({ label, value, icon: Icon, tone, href }) => <Link key={label} href={href} className={`overview-metric overview-metric-${tone}`}>
        <div><p className="overview-metric-label">{label}</p><p className="overview-metric-value">{value}</p></div><span className="overview-metric-icon"><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span>
      </Link>)}
    </section>
    <section className="overview-charts">
      <article className="overview-panel overview-workload-panel"><h2 className="overview-panel-title">Team Workload (Tasks per Employee)</h2><WorkloadChart employees={employees} /></article>
      <article className="overview-panel overview-status-panel"><h2 className="overview-panel-title">Status Distribution</h2><StatusChart distribution={distribution} total={counts.total} /></article>
    </section>
    <section className="overview-panel overview-performance" aria-labelledby="employee-performance-title">
      <div className="overview-table-heading"><h2 id="employee-performance-title" className="overview-panel-title">Employee Performance</h2><Link href="/admin/employees">VIEW ALL <ArrowRight size={12} aria-hidden="true" /></Link></div>
      <div className="overview-table-scroll"><table className="overview-table">
        <caption className="sr-only">Employee task performance. Review scores are average manager ratings out of five. Hours are unavailable when no time has been recorded.</caption>
        <colgroup><col style={{ width: "14%" }} /><col style={{ width: "23%" }} />{["9%", "9%", "9%", "9%", "8%", "8%", "11%"].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
        <thead><tr>{["Employee", "Role", "Assigned", "Completed", "Pending", "Awaiting", "Overdue", "Hours", "Score"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{employees.length ? employees.map((person) => {
          const score = person.reviewScore;
          const label = score == null ? null : score >= 4.5 ? "Excellent" : score >= 3.5 ? "Good" : "Needs review";
          return <tr key={person.id}>
            <th scope="row"><Link href={`/admin?employee=${encodeURIComponent(person.id)}`}>{person.name}</Link></th>
            <td className="overview-role">{person.designation}</td><td>{person.assigned}</td><td className="overview-completed">{person.completed}</td><td>{Math.max(0, person.active - person.awaiting)}</td><td>{person.awaiting}</td><td className="overview-overdue">{person.overdue}</td><td className="overview-hours"><span title="No time recorded">—</span></td><td>{score == null ? <span className="overview-unrated">—</span> : <span className={`overview-score ${score >= 4.5 ? "score-excellent" : score >= 3.5 ? "score-good" : "score-review"}`} title="Average manager review rating out of 5">{score.toFixed(1)} · {label}</span>}</td>
          </tr>;
        }) : <tr><td colSpan={9} className="overview-table-empty">No employees yet. <Link href="/admin/employees">Manage your team</Link></td></tr>}</tbody>
      </table></div>
    </section>
  </div>;
}
