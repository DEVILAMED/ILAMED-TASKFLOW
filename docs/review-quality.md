# Review quality policy

The performance page reports manager-rated work quality and current task activity separately. It does not calculate an overall employee performance rating. Role outcomes, task complexity, delivery reliability, dependencies, and employee feedback require a manager discussion against agreed expectations.

## Evidence and reporting

- The default reporting period is the last 90 calendar days, including today, in Asia/Kolkata. The performance page also offers 30 and 365 days. Current task counts cover all current assignments and are independent of this filter.
- Each task and submitter contributes its latest valid rated review within the selected period. Repeated revision reviews remain in the feedback history and revision count, but do not increase that task's weight.
- Reviews are attributed to the submission's author, not the task's current assignee. Reassignment does not transfer past ratings.
- Sundays are company holidays. Administrators can record or remove an employee's leave by date in Team → Manage user accounts → Manage leave. Dates use the India calendar.
- A Sunday or leave-day submission stays in feedback history and is excluded from the review score. The manager's review date still determines the reporting period.
- Company task schedules use Monday through Saturday. Leave within the planned range moves the effective deadline to preserve the planned workdays. Deadlines on Sunday roll forward. Saved assignment dates remain available in the task editor.
- An employee needs at least five distinct reviewed tasks in the period for a score. Below that threshold, show "Limited evidence"; without rated tasks, show "Not rated". Five is a product default, not a statistical confidence guarantee or an industry standard.
- Individual quality is the average qualifying rating multiplied by 20 and rounded to a whole number. Team quality averages the unrounded individual averages of eligible employees with equal weight per employee, then converts and rounds once. Employees below the evidence threshold are excluded. The page shows participation and contributing task counts so this exclusion is visible.
- The admin overview, roster cards, and employee dashboard use the same 90-day policy. Monthly history applies the same rules within each India calendar month and identifies the current month as partial. Missing evidence is never plotted as zero.
- Managers can inspect employees in their currently managed teams and their own work. Employees can inspect only their own work; administrators can inspect company work.

## Rating criteria and bands

Ratings must be deliberately selected for each submission; no rating is preselected or carried over to a resubmission. Written feedback is required. The API rejects stale submissions and concurrent task changes before saving a rating. Managers assess quality against the task's agreed acceptance criteria:

1. Does not meet requirements: major omissions or errors, substantial rework needed.
2. Partially meets requirements: significant corrections needed.
3. Meets requirements: acceptance criteria met with only minor corrections needed.
4. Exceeds requirements: accurate, thorough work exceeding agreed quality expectations.
5. Exceptional quality: specific evidence of added value, clearly beyond expectations, no material corrections needed.

Displayed bands are 90–100 Excellent, 80–89 Good, 60–79 Meets requirements, and below 60 Needs review. A rating of 3/5 therefore counts as meeting requirements. The shared policy and labels live in `lib/review-quality.ts`.

Existing feedback is retained. Historical ratings may predate this rubric; they are not retrospectively reclassified as rubric-based evidence. Managers should align their use of the rubric, review examples together, and discuss context and employee feedback before making comparisons or formal appraisal decisions.
