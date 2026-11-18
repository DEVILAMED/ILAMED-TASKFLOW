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

When submitting or resubmitting a task for review, employees can optionally attach up to five JPEG, PNG, or WebP images (5 MB each), preview them, and remove files before confirming. Images appear in the review queue and the task's recent submission history. Access is restricted to the assignee, administrators, and responsible team managers. Uploads are checked and re-encoded as WebP, with a maximum dimension of 1920 pixels and embedded metadata removed. Images are stored in PostgreSQL and included in database backups; deleting a task cascades to its submission images. Apply `20261117133000_add_task_submission_images` and regenerate Prisma Client before starting the updated app, or redeploy with the included Dockerfile.

Administrators can open an existing company task from list, board, or calendar view and choose **Edit task** to update its title, description, date range, priority, or assignee. **Delete task** requires confirmation and permanently removes the task and its related checklist, comments, submissions, reviews, and notifications. The assignee is notified when the date range changes or a task is deleted. Employee and manager progress and review permissions remain unchanged.

Choose **Repeat → Daily on working days** when creating or assigning a company task. Set the first date and, optionally, the last repeat date; leaving the last date blank keeps the schedule running. Sundays and the employee's recorded leave days are skipped, including when finding the first working date. Each working day gets a separate task, a fresh checklist, its own submission/images, and an independent manager review. A pending review from an earlier day does not block the next day's work. Daily occurrences count separately in task totals and review quality.

Administrators can also open an existing task and choose **Set up daily repeat** to begin fresh copies from the next working day. **Stop daily repeat** prevents future copies and preserves all existing tasks, submissions, and reviews. Managers can stop schedules for tasks they manage from **Daily task schedules**. Editing, cancelling, or deleting an individual occurrence affects that task only; future copies use the saved schedule's original instructions, priority, checklist, and assignee. Stop the old schedule and create a new daily task to change future copies.

Daily dates use India time. Due occurrences are generated when company task, dashboard, team, performance, or report views load, and during task-board refreshes; a separate cron service is not required. Missed working dates are caught up, and a persisted cursor plus a unique schedule/date constraint prevent duplicate tasks and notifications across concurrent requests or multiple app instances. Future dates are created when they become due, apart from the first scheduled task. Existing non-repeating tasks keep their current behavior. Apply `20261118120000_add_daily_company_tasks` with `npx prisma migrate deploy` and regenerate Prisma Client before running the updated app, or redeploy with the included Dockerfile. Run the daily submission and repeat regression checks with `node --test lib/company-task-repeat.test.mjs`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

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

Employees report blockers without changing task status or deadlines. Administrators and the responsible team manager authorize holds and resume held work; those changes notify the employee and record task history. Checklist completion is displayed separately from approval status.

Run the workflow and task-link regression checks with Node.js 24:

```bash
node --test lib/company-task-workflow.test.mjs lib/company-task-links.test.mjs
```
