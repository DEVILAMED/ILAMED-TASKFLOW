"use client";

import { useState } from "react";
import { MIN_REVIEWED_TASKS, type ReviewEvidenceDetail } from "@/lib/review-quality";
import UserAvatar from "@/app/user-avatar";

const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default function PerformanceEvidence({ evidence, isTeam }: { evidence: ReviewEvidenceDetail[]; isTeam: boolean }) {
  const [query, setQuery] = useState("");
  const [employee, setEmployee] = useState("");
  const [rating, setRating] = useState("");
  const employees = [...new Map(evidence.map(review => [review.employeeId, review.employeeName])).entries()];
  const visible = evidence.filter(review => (!query.trim() || [review.taskTitle, review.feedback, review.reviewerName].some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    && (!employee || review.employeeId === employee) && (!rating || review.rating === Number(rating)));
  return <section className="workspace-surface performance-methodology">
    <details><summary>View review evidence ({evidence.length} task assessments)</summary>
      <p className="performance-context">Latest rated review per task and submitter in this period. {isTeam ? `Employees with fewer than ${MIN_REVIEWED_TASKS} reviewed tasks are included here for context and excluded from the team score.` : "Earlier reviews remain in your feedback history."}</p>
      <div className="my-3 flex flex-wrap items-end gap-3">
        <label className="workspace-field">Search evidence<input type="search" className="soft-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Task, feedback, or reviewer" /></label>
        {isTeam ? <label className="workspace-field">Employee<select className="soft-input" value={employee} onChange={event => setEmployee(event.target.value)}><option value="">All employees</option>{employees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label> : null}
        <label className="workspace-field">Rating<select className="soft-input" value={rating} onChange={event => setRating(event.target.value)}><option value="">All ratings</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}/5</option>)}</select></label>
        <button type="button" className="secondary-button px-3 py-2" onClick={() => { setQuery(""); setEmployee(""); setRating(""); }}>Clear filters</button>
      </div>
      <p role="status" className="performance-context">Showing {visible.length} of {evidence.length} assessments. Evidence filters do not change the quality score.</p>
      {visible.length ? <div className="performance-evidence"><table>
        <caption className="sr-only">Review evidence for the selected period; dates are in India time.</caption>
        <thead><tr><th scope="col">Task and evidence</th>{isTeam ? <th scope="col">Employee</th> : null}<th scope="col">Rating</th><th scope="col">Reviewed</th></tr></thead>
        <tbody>{visible.map(review => <tr key={review.id}>
          <td><strong>{review.taskTitle}</strong><p>{review.feedback}</p><small>{review.decision.replaceAll("_", " ").toLowerCase()} ? {review.reviewerName}</small></td>
          {isTeam ? <td><span className="user-identity"><UserAvatar name={review.employeeName} src={review.employeeAvatarUrl} size={24} />{review.employeeName}</span></td> : null}
          <td>{review.rating}/5</td><td><time dateTime={new Date(review.createdAt).toISOString()}>{dateFormatter.format(new Date(review.createdAt))}</time></td>
        </tr>)}</tbody>
      </table></div> : <p className="performance-context">{evidence.length ? "No assessments match these filters." : "No rated reviews in this period."}</p>}
    </details>
  </section>;
}
