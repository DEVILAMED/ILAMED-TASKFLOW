import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getDemoProjectId } from "@/services/demo-project";

function daysFromToday(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const projectId = getDemoProjectId(user.id);
  const existingProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  });
  if (existingProject) {
    if (existingProject.ownerId !== user.id) {
      return NextResponse.json({ ok: false, error: "Unable to create the example project." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, projectId, existing: true });
  }

  const teamId = `demo-team-${user.id}`;
  const alexId = `demo-user-${user.id}-alex`;
  const jordanId = `demo-user-${user.id}-jordan`;
  const samId = `demo-user-${user.id}-sam`;
  const sprintStart = daysFromToday(-3);
  const sprintEnd = daysFromToday(8);
  const historyStart = daysFromToday(-24);
  const historyCompleted = daysFromToday(-17);

  const projectName = "Taskflow Feature Showcase";
  const tasks = [
    { key: "accessibility", title: "Complete accessibility review", description: "Audit keyboard navigation, focus states, and screen-reader labels before the release.", issueType: "TASK" as const, status: "IN_PROGRESS" as const, priority: "HIGH" as const, storyPoints: 5, dueDate: daysFromToday(2), assigneeId: alexId, sprint: "active" as const, label: "Quality" },
    { key: "dashboard", title: "Build project health dashboard", description: "Show delivery progress, active sprint scope, and upcoming risks in a compact overview.", issueType: "STORY" as const, status: "TODO" as const, priority: "HIGH" as const, storyPoints: 8, dueDate: daysFromToday(5), assigneeId: jordanId, sprint: "active" as const, label: "Product" },
    { key: "copy", title: "Review onboarding copy", description: "Confirm the setup language is clear for new project owners.", issueType: "TASK" as const, status: "TODO" as const, priority: "MEDIUM" as const, storyPoints: 3, dueDate: daysFromToday(7), assigneeId: null, sprint: "active" as const, label: "Product" },
    { key: "release-plan", title: "Confirm rollout checklist", description: "The release checklist is ready for final verification.", issueType: "TASK" as const, status: "DONE" as const, priority: "MEDIUM" as const, storyPoints: 2, dueDate: daysFromToday(-1), assigneeId: user.id, sprint: "active" as const, label: "Quality" },
    { key: "mention", title: "Prepare stakeholder update", description: "Collect the latest decisions and summarize the next milestone.", issueType: "STORY" as const, status: "IN_PROGRESS" as const, priority: "MEDIUM" as const, storyPoints: 5, dueDate: daysFromToday(3), assigneeId: samId, sprint: "backlog" as const, label: "Planning" },
    { key: "unassigned", title: "Map remaining launch risks", description: "Unassigned issue visible to all project collaborators for triage.", issueType: "BUG" as const, status: "TODO" as const, priority: "HIGH" as const, storyPoints: 3, dueDate: daysFromToday(1), assigneeId: null, sprint: "backlog" as const, label: "Quality" },
    { key: "history-one", title: "Publish sprint kickoff notes", description: "Kickoff notes published for the previous sprint.", issueType: "TASK" as const, status: "DONE" as const, priority: "LOW" as const, storyPoints: 2, dueDate: daysFromToday(-20), assigneeId: alexId, sprint: "history" as const, label: "Planning" },
    { key: "history-two", title: "Agree on launch metrics", description: "The team aligned on the initial success metrics.", issueType: "STORY" as const, status: "DONE" as const, priority: "MEDIUM" as const, storyPoints: 5, dueDate: daysFromToday(-19), assigneeId: jordanId, sprint: "history" as const, label: "Product" },
    { key: "history-three", title: "Prepare release notes", description: "Release notes completed and shared with stakeholders.", issueType: "TASK" as const, status: "DONE" as const, priority: "LOW" as const, storyPoints: 3, dueDate: daysFromToday(-18), assigneeId: samId, sprint: "history" as const, label: "Planning" },
    { key: "history-carry", title: "Refine mobile empty states", description: "Carried over from the previous sprint; now back in the backlog.", issueType: "TASK" as const, status: "TODO" as const, priority: "MEDIUM" as const, storyPoints: 5, dueDate: daysFromToday(4), assigneeId: null, sprint: "backlog" as const, label: "Product" },
  ];

  try {
    await prisma.$transaction(async (tx) => {
      const demoUsers = [
        { id: alexId, name: "Alex Rivera", email: `alex-${user.id}@example.invalid` },
        { id: jordanId, name: "Jordan Lee", email: `jordan-${user.id}@example.invalid` },
        { id: samId, name: "Sam Patel", email: `sam-${user.id}@example.invalid` },
      ];
      for (const demoUser of demoUsers) {
        await tx.user.upsert({
          where: { id: demoUser.id },
          create: demoUser,
          update: { name: demoUser.name, email: demoUser.email },
        });
      }

      await tx.team.upsert({
        where: { id: teamId },
        create: {
          id: teamId,
          name: "Feature Showcase Team",
          createdById: user.id,
          memberships: {
            create: [
              { userId: user.id, role: "MANAGER" },
              { userId: alexId, role: "MANAGER" },
              { userId: jordanId, role: "MEMBER" },
              { userId: samId, role: "MEMBER" },
            ],
          },
        },
        update: { name: "Feature Showcase Team" },
      });
      for (const membership of [
        { userId: user.id, role: "MANAGER" as const },
        { userId: alexId, role: "MANAGER" as const },
        { userId: jordanId, role: "MEMBER" as const },
        { userId: samId, role: "MEMBER" as const },
      ]) {
        await tx.teamMembership.upsert({
          where: { teamId_userId: { teamId, userId: membership.userId } },
          create: { teamId, ...membership },
          update: { role: membership.role },
        });
      }

      await tx.project.create({
        data: {
          id: projectId,
          title: projectName,
          description: "A sample workspace with demo-only teammate profiles. Explore the board, sprint planning and history, team workload, activity, comments, labels, and notifications. Demo profiles use reserved example.invalid emails and cannot sign in.",
          ownerId: user.id,
          teamId,
          members: { create: [{ userId: jordanId, role: "MEMBER" }] },
        },
      });

      const [activeSprint, historySprint] = await Promise.all([
        tx.sprint.create({
          data: {
            title: "Sprint 04 · Launch readiness",
            goal: "Complete quality checks and prepare a confident rollout.",
            startDate: sprintStart,
            endDate: sprintEnd,
            isActive: true,
            projectId,
          },
        }),
        tx.sprint.create({
          data: {
            title: "Sprint 03 · Product foundations",
            goal: "Align the team on launch foundations and core product decisions.",
            startDate: historyStart,
            endDate: historyCompleted,
            isActive: false,
            completedAt: historyCompleted,
            scopeTasks: 4,
            scopePoints: 15,
            completedTasks: 3,
            carriedOverTasks: 1,
            completedPoints: 10,
            carriedOverPoints: 5,
            projectId,
          },
        }),
      ]);

      const labels = await Promise.all([
        tx.label.create({ data: { name: "Product", color: "#6366f1" } }),
        tx.label.create({ data: { name: "Quality", color: "#f97316" } }),
        tx.label.create({ data: { name: "Planning", color: "#0ea5e9" } }),
      ]);
      const labelIds = new Map(labels.map((label) => [label.name, label.id]));
      const createdTasks = new Map<string, { id: string; title: string; assigneeId: string | null }>();
      for (const task of tasks) {
        const sprintId = task.sprint === "active" ? activeSprint.id : task.sprint === "history" ? historySprint.id : null;
        const createdTask = await tx.task.create({
          data: {
            title: task.title,
            description: task.description,
            issueType: task.issueType,
            status: task.status,
            priority: task.priority,
            storyPoints: task.storyPoints,
            dueDate: task.dueDate,
            assigneeId: task.assigneeId,
            sprintId,
            projectId,
          },
          select: { id: true, title: true, assigneeId: true },
        });
        createdTasks.set(task.key, createdTask);
        const labelId = labelIds.get(task.label);
        if (labelId) {
          await tx.taskLabel.create({ data: { taskId: createdTask.id, labelId } });
        }
      }

      const comments = [
        { key: "accessibility", userId: jordanId, content: `I added keyboard checks to the review. @${user.email} can you confirm the release criteria?` },
        { key: "dashboard", userId: alexId, content: "The first dashboard pass is ready for feedback. I will share a preview tomorrow." },
        { key: "mention", userId: samId, content: "I can pick up the stakeholder summary after the metrics are confirmed." },
      ];
      for (const comment of comments) {
        await tx.comment.create({
          data: {
            taskId: createdTasks.get(comment.key)!.id,
            userId: comment.userId,
            content: comment.content,
            createdAt: daysFromToday(-1),
          },
        });
      }

      await tx.sprintProgressSnapshot.createMany({
        data: [
          { sprintId: activeSprint.id, snapshotDate: daysFromToday(-2), scopeTasks: 4, scopePoints: 18, remainingTasks: 3, remainingPoints: 16 },
          { sprintId: activeSprint.id, snapshotDate: daysFromToday(-1), scopeTasks: 4, scopePoints: 18, remainingTasks: 2, remainingPoints: 11 },
          { sprintId: activeSprint.id, snapshotDate: daysFromToday(0), scopeTasks: 4, scopePoints: 18, remainingTasks: 2, remainingPoints: 11 },
          { sprintId: historySprint.id, snapshotDate: daysFromToday(-24), scopeTasks: 4, scopePoints: 15, remainingTasks: 4, remainingPoints: 15 },
          { sprintId: historySprint.id, snapshotDate: daysFromToday(-22), scopeTasks: 4, scopePoints: 15, remainingTasks: 3, remainingPoints: 10 },
          { sprintId: historySprint.id, snapshotDate: daysFromToday(-20), scopeTasks: 4, scopePoints: 15, remainingTasks: 2, remainingPoints: 5 },
          { sprintId: historySprint.id, snapshotDate: daysFromToday(-17), scopeTasks: 4, scopePoints: 15, remainingTasks: 1, remainingPoints: 5 },
        ],
      });

      await tx.activity.createMany({
        data: [
          { type: "SPRINT_CREATED", message: `created sprint "${activeSprint.title}"`, userId: user.id, projectId },
          { type: "TASK_CREATED", message: "created story \"Build project health dashboard\"", userId: user.id, projectId, taskId: createdTasks.get("dashboard")!.id },
          { type: "TASK_COMMENTED", message: "commented on task \"Complete accessibility review\"", userId: jordanId, projectId, taskId: createdTasks.get("accessibility")!.id },
          { type: "TASK_COMMENTED", message: "commented on task \"Prepare stakeholder update\"", userId: samId, projectId, taskId: createdTasks.get("mention")!.id },
          { type: "SPRINT_COMPLETED", message: "completed sprint \"Sprint 03 · Product foundations\" and moved 1 unfinished issue to the backlog", userId: user.id, projectId },
          { type: "TASK_COMPLETED", message: "completed task \"Confirm rollout checklist\"", userId: user.id, projectId, taskId: createdTasks.get("release-plan")!.id },
        ],
      });

      await tx.notification.createMany({
        data: [
          { userId: user.id, actorId: alexId, projectId, taskId: createdTasks.get("release-plan")!.id, type: "TASK_ASSIGNED", message: "Alex Rivera assigned you to \"Confirm rollout checklist\"", href: `/projects/${projectId}?tab=board&taskId=${createdTasks.get("release-plan")!.id}`, createdAt: new Date() },
          { userId: user.id, actorId: jordanId, projectId, taskId: createdTasks.get("accessibility")!.id, type: "MENTIONED", message: "Jordan Lee mentioned you on \"Complete accessibility review\"", href: `/projects/${projectId}?tab=board&taskId=${createdTasks.get("accessibility")!.id}`, createdAt: daysFromToday(-1) },
          { userId: user.id, actorId: samId, projectId, taskId: createdTasks.get("mention")!.id, type: "TASK_COMMENTED", message: "Sam Patel commented on \"Prepare stakeholder update\"", href: `/projects/${projectId}?tab=board&taskId=${createdTasks.get("mention")!.id}`, createdAt: daysFromToday(-2) },
          { userId: user.id, actorId: alexId, projectId, taskId: createdTasks.get("dashboard")!.id, type: "DUE_DATE_CHANGED", message: "Alex Rivera changed the due date for \"Build project health dashboard\" to " + daysFromToday(5).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), href: `/projects/${projectId}?tab=board&taskId=${createdTasks.get("dashboard")!.id}`, createdAt: daysFromToday(-3) },
        ],
      });

    }, { timeout: 30_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const projectCreatedConcurrently = await prisma.project.findUnique({
        where: { id: projectId },
        select: { ownerId: true },
      });
      if (projectCreatedConcurrently?.ownerId === user.id) {
        return NextResponse.json({ ok: true, projectId, existing: true });
      }
    }
    console.error("Failed to create feature showcase project", error);
    return NextResponse.json({ ok: false, error: "Unable to create the example project. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, projectId, existing: false }, { status: 201 });
}
