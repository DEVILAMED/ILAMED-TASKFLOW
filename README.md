This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Deploy to a VPS with Coolify

Use the included `Dockerfile` and follow the [Coolify deployment guide](docs/deploy-coolify.md)
to create PostgreSQL, configure runtime variables, connect a domain, and create
the first administrator. The container applies pending Prisma migrations before
starting Next.js on port 3000.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Environment and roles

Copy `.env.example` to `.env` and set your PostgreSQL credentials. PostgreSQL connections are allowed up to 15 seconds to establish; override `PG_CONNECTION_TIMEOUT_MS` if your database needs a different connection timeout. `PG_POOL_MAX` defaults to one connection per app process to limit pressure on providers using session-mode connection pools. Only increase it if the database pool has room for the combined connections from every app process or instance. Apply database changes and generate the Prisma client before starting the app:

```bash
npx prisma migrate deploy
npx prisma generate
npm run dev
```

Regular accounts have the `USER` role and land in the company task tracker at `/company-tasks`. Employees see only tasks assigned to them, update status, and add progress notes or blockers. Administrators land in `/admin`, where they assign and reassign tasks with optional due dates and priority, search tasks, filter by employee, status, priority, or due date, and spot overdue work. Employees receive in-app notifications for assignments and task updates. `/dashboard` forwards to the appropriate task view.

The admin employee list shows live in-app presence. Authenticated workspace pages send a heartbeat every 30 seconds while visible; employees appear online for 90 seconds after their last heartbeat, and the admin list refreshes every 15 seconds. Presence is not device or off-app activity tracking. Apply the `20261030105000_add_user_presence` migration before deploying this feature.

The company task workflow uses a shared internal project record to store assignments; admins and employees work with a single task list rather than project or sprint screens. Existing project and team data is left untouched, but project workspaces are no longer the default company workflow. Personal to-dos remain separate at `/todos` for private or shared lists, My Day, reminders, repeating tasks, and task steps.

The personal task workspace requires the `20261028131000_add_personal_todo_workspace` migration. Apply database changes and regenerate Prisma Client after pulling schema changes:

```bash
npx prisma migrate deploy
npx prisma generate
```

The login and registration forms do not expose administrator setup. To create the first administrator, bootstrap the account through your deployment process using `ADMIN_EMAIL` and a long random `ADMIN_BOOTSTRAP_TOKEN` configured in `.env`; keep the token private and remove it from the environment after setup. Once an administrator exists, admins can manage employee access from the **Employees** section and assign tasks to non-admin accounts.

Administrators can see every registered account under **Team → Manage user accounts**, including other administrators and their own account. Search and the role filter cover administrators, managers, and employees, with role labels and a **You** marker for the current account. To change another administrator to a regular user, choose **User** from that account's **Role** selector. You cannot change your own role or demote the last administrator. Administrator account details remain protected; employee and manager accounts offer **Edit account** to update names and sign-in emails or set a new password. Leaving the password blank preserves it. Email and password changes revoke that user's existing sessions. The endpoint remains restricted to administrators. Duplicate emails and invalid details are rejected. These changes use the existing schema and require no database migration.

Administrators can switch between **All departments**, an individual department, and **Unassigned employees only** on Dashboard, Team, Tasks, and Calendar. Each department view includes its assigned employees plus employees without a department (including accounts without an employee profile). Dashboard totals, workload, review quality, and company tasks follow the selected department; tasks without an assignee remain visible in every department. The selection stays in the URL and carries between these admin tabs. Administrator accounts remain accessible under Team in every department view.

Choose **Create department** directly on the dashboard to create and open a department. Use the **Department** selector in the dashboard's employee table or in Team account management to assign, move, or unassign an employee without opening their full profile. Assignments save immediately and preserve the rest of the employee's profile. **Manage departments** still provides descriptions, department heads, renaming, and deletion. These controls use the existing department and employee-profile schema; no database migration is needed. Run their regression checks with `node --test lib/employee-departments.test.mjs`.

Company task creation uses a required **Start date → End date** range, including same-day work. Tasks appear on every date in that inclusive range in the company calendars, and become overdue only after the end date. Existing tasks retain their saved dates; an older task without a start date displays its existing end date until an administrator schedules the full range. Apply the `20261117120000_add_task_date_range` migration before running the updated app. The included Dockerfile applies it automatically at startup in Coolify.

Company tasks display checklist completion as a percentage and progress bar in the task list, cards, details, calendar agendas, and manager task controls. Each checklist item contributes equally: three completed items out of five show **60%**. Checking or unchecking an item recalculates the percentage; tasks without checklist items show **No checklist**. Checklist completion is separate from manager approval and does not change the task's workflow status.

Company task lists, cards, details, and manager task controls show **Assigned by**, using the assigning administrator or manager's name (or email when no name is set). Reassigning a task records the new assigner; ordinary task edits preserve the existing assigner, and unassigning clears it. Daily occurrences identify the person who configured their repeat schedule. Apply `20261120120000_add_task_assigner` with `npx prisma migrate deploy` and regenerate Prisma Client before starting the app; the Dockerfile applies migrations at startup. The migration recovers existing company assignments from the latest assignment notification when it matches the current assignee. Missing history or a deleted assigner displays **Not recorded**. Run the assignment and recurring-task checks with `node --test lib/submission-routes.test.mjs lib/company-task-repeat.test.mjs`.

When submitting or resubmitting a task for review, employees can optionally attach up to five JPEG, PNG, or WebP images (5 MB each), preview them, and remove files before confirming. Images appear in the review queue and the task's recent submission history. Access is restricted to the assignee, administrators, and responsible team managers. Uploads are checked and re-encoded as WebP, with a maximum dimension of 1920 pixels and embedded metadata removed. Images are stored in PostgreSQL and included in database backups; deleting a task cascades to its submission images. Apply `20261117133000_add_task_submission_images` and regenerate Prisma Client before starting the updated app, or redeploy with the included Dockerfile.

Administrators can open an existing company task from list, board, or calendar view and choose **Edit task** to update its title, description, date range, priority, or assignee. **Delete task** requires confirmation and moves the task to the administrator recycle bin. Its checklist, comments, submissions, reviews, and uploaded files remain recoverable. The assignee is notified when the date range changes or a task is deleted. Employee and manager progress and review permissions remain unchanged.

Choose **Repeat → Daily on working days** when creating or assigning a company task. Set the first date and, optionally, the last repeat date; leaving the last date blank keeps the schedule running. Sundays and the employee's recorded leave days are skipped, including when finding the first working date. A repeat is one task in lists, cards, workload totals, dashboards, and review-quality task counts. Downloaded evidence reports retain every daily occurrence. Open its details and choose **Work date** under **Daily submissions** to access each day's fresh checklist, submission/images, and independent manager review. A pending review from an earlier day does not block the next day's work. Approval queues and calendars retain separate daily entries. New daily work sends a submission-ready update instead of a new task assignment. The original creation date is retained in task totals; an approved series with future work remains open. Review quality uses the latest eligible review for the series per employee, with every review retained in history. Existing daily records are grouped automatically; no additional migration is required. Run `node --test lib/company-task-series.test.mjs lib/company-task-repeat.test.mjs lib/review-quality.test.mjs`.

Administrators can also open an existing task and choose **Set up daily repeat** to begin fresh copies from the next working day. **Stop daily repeat** prevents future copies and preserves all existing tasks, submissions, and reviews. Managers can stop schedules for tasks they manage from **Daily task schedules**. Editing, cancelling, or deleting an individual occurrence affects that task only; future copies use the saved schedule's original instructions, priority, checklist, and assignee. Stop the old schedule and create a new daily task to change future copies.

Daily dates use India time. Due occurrences are generated when company task, dashboard, team, performance, or report views load, and during task-board refreshes; a separate cron service is not required. Missed working dates are caught up, and a persisted cursor plus a unique schedule/date constraint prevent duplicate tasks and notifications across concurrent requests or multiple app instances. Future dates are created when they become due, apart from the first scheduled task. Existing non-repeating tasks keep their current behavior. Apply `20261118120000_add_daily_company_tasks` with `npx prisma migrate deploy` and regenerate Prisma Client before running the updated app, or redeploy with the included Dockerfile. Run the daily submission and repeat regression checks with `node --test lib/company-task-repeat.test.mjs`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Session renewal

Sessions last seven days. Visible workspace heartbeats and `/api/auth/me` renew an active session when fewer than 12 hours remain, updating the database expiry and the browser's HttpOnly cookie together. These endpoints also synchronize the cookie with the saved expiry after a lost renewal response. Server-rendered pages only validate sessions and do not extend their database expiry. Expired, revoked, and blocked sessions cannot be renewed. Inactive users whose cookie has expired must sign in again. No database migration is required for this change. Run its regression checks with `node --test lib/auth-sessions.test.mjs`.

## Personal task reminders

Due reminders are saved in Notifications for the list owner and current shared-list members, even without desktop permission. A background worker in the running Node server checks every 30 seconds in batches of 100; viewing Notifications also catches up accessible due reminders. Failed batches retry on the next sweep, and database claims plus unique receipts prevent duplicate notifications across app instances, tabs, reloads, and restarts. Blocked accounts are excluded, and users who lose list access cannot read or claim its reminders.

Enable desktop reminders from Personal Tasks. Desktop alerts work across signed-in workspace pages, with a saved claim preventing repeats on other tabs or devices. Desktop delivery is at most once: if a tab closes or browser delivery fails after a claim, the unread in-app reminder remains available. Completing a task or changing/removing its reminder suppresses pending old desktop alerts. A different reminder time creates a new reminder; choosing a previously delivered time does not send it twice. Old in-app reminders remain as history, and deleting a task removes its reminders.

The Node server must remain running for background processing. Downtime is caught up after restart. Desktop pop-ups need an open app tab and browser permission; Web Push for delivery with every tab closed is not configured. No separate cron service or push credentials are required for the in-app worker.

Before starting the updated app, apply `20261119120000_add_durable_personal_reminders` and regenerate Prisma Client:

```bash
npx prisma migrate deploy
npx prisma generate
```

The included Dockerfile applies migrations at startup. Run reminder regression checks with `node --test lib/personal-task-reminders.test.mjs`.

## Task authorship, evidence history, archive and reminders

Apply `20261120160000_task_authorship_history_and_digest` with `npx prisma migrate deploy`, then run `npx prisma generate` before starting the updated app. The Dockerfile applies pending migrations at startup.

Company tasks have a permanent `createdById`, separate from the current assigner. Regular users can edit details only while assigned to a task they originally created; administrator reassignment does not overwrite authorship. The migration recovers creators from verified creation status events or the originating repeat schedule. Other legacy creators remain unknown rather than inferring ownership from the latest assignment.

Each new submission saves its title, instructions, priority, dates, assignee, creator, and checklist as an immutable snapshot. Later edits do not rewrite this evidence. Original instructions are available in submission history, the review queue, and performance exports. Legacy submissions without snapshots are labelled explicitly. Task edits and checklist progress are logged with the actor, timestamp, and before/after values; changes appear on the dedicated task page and in performance exports. Submitted or closed work cannot have checklist progress changed.

Administrators can archive closed tasks from their task page. Archived tasks are read-only, leave active work lists, and remain included in historical performance reports. Use **Tasks ? Archive & recycle bin** to browse archived tasks, unarchive them, or restore recycled tasks. Deleting a task preserves all evidence and uploads; there is no automatic permanent purge. Restoring preserves its status and archive state. Archiving or recycling a daily occurrence does not stop the repeating schedule; stop daily repeat separately when needed.

A server worker checks company schedules and reminders every minute. From 09:00 India time, active users receive at most one in-app digest per working day with actionable tasks due today, due on the next working day, or overdue. Managers and administrators also see reminders for authorized submissions awaiting review for at least 24 hours. Sundays, recorded leave, blocked users, and inactive employees are skipped. Submitted work and tasks on hold do not produce employee deadline reminders. Empty digests are suppressed. The digest uses durable per-user/date receipts, with receipt and notification saved in one transaction, so concurrent instances and restarts do not duplicate delivery. Downtime is caught up for the current eligible day after restart. The Node process must remain running; email and closed-browser push delivery are not part of this digest.

Run `node --test lib/company-task-digest.test.mjs lib/company-task-lifecycle.test.mjs lib/company-task-repeat.test.mjs` for the feature checks.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Workspace navigation and task workflow

The admin task workspace is at `/admin`. Assignment opens from **Assign task**, employee account management is at `/admin/employees`, and existing company analytics are at `/admin/overview`. Reports remain at `/reports`.

Task views keep filters, sort order, calendar month, and the selected task in the URL. Search and company notifications link to the appropriate task or review. Tasks and reviews refresh when returning to the workspace and periodically while visible; drafts remain in component state during those refreshes. Calendar tasks can also be opened from the monthly agenda, including on mobile.

Administrators and managers can filter the Approvals queue by user, search task details or submission notes, and choose an inclusive From/To range for submission dates or due dates. Submission dates and displayed timestamps use India time. Sort by due date, newest submission, or oldest submission; Clear filters resets these controls. Filters are saved in the URL and combine with a selected submission link. The queue continues to show only pending submissions the reviewer can access. No database migration is required. Run the filtering checks with `node --test lib/approval-filters.test.mjs`.

Employees report blockers without changing task status or deadlines. Administrators and the responsible team manager authorize holds and resume held work; those changes notify the employee and record task history. Checklist completion is displayed separately from approval status.

Run the workflow and task-link regression checks with Node.js 24:

```bash
node --test lib/company-task-workflow.test.mjs lib/company-task-links.test.mjs
```
