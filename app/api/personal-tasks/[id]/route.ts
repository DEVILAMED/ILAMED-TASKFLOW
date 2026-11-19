import { NextResponse } from "next/server";
import { Prisma, TodoRepeat } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { accessibleTodoListWhere, findAccessibleTodoTask } from "@/lib/todo-access";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };
type TaskPayload = {
  title?: unknown;
  note?: unknown;
  important?: unknown;
  isCompleted?: unknown;
  dueDate?: unknown;
  reminderAt?: unknown;
  myDayDate?: unknown;
  repeat?: unknown;
  listId?: unknown;
};

function nextRepeatDate(date: Date, repeat: TodoRepeat) {
  const next = new Date(date);
  switch (repeat) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      break;
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "MONTHLY": {
        const day = next.getDate();
        next.setDate(1);
        next.setMonth(next.getMonth() + 1);
        next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
        break;
    }
    case "YEARLY": {
        const month = next.getMonth();
        next.setFullYear(next.getFullYear() + 1);
        if (next.getMonth() !== month) next.setDate(0);
        break;
    }
  }
  return next;
}

function addMyDayDate<T extends { myDayEntries: { date: Date }[] }>(task: T) {
  const { myDayEntries, ...taskData } = task;
  return { ...taskData, myDayDate: myDayEntries[0]?.date ?? null };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await findAccessibleTodoTask(id, user.id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
  }

  let payload: TaskPayload | null = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const data: Prisma.TodoTaskUpdateInput = {};
  const recurringTask = {
    title: existing.title,
    note: existing.note,
    important: existing.important,
  };
  if (payload?.title !== undefined) {
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    if (!title || title.length > 200) {
      return NextResponse.json({ ok: false, error: "Task title must be 1 to 200 characters." }, { status: 400 });
    }
    data.title = title;
    recurringTask.title = title;
  }
  if (payload?.note !== undefined) {
    if (payload.note !== null && typeof payload.note !== "string") {
      return NextResponse.json({ ok: false, error: "Task note must be text." }, { status: 400 });
    }
    data.note = typeof payload.note === "string" ? payload.note.trim() || null : null;
    recurringTask.note = data.note;
  }
  if (payload?.important !== undefined) {
    if (typeof payload.important !== "boolean") {
      return NextResponse.json({ ok: false, error: "Important must be true or false." }, { status: 400 });
    }
    data.important = payload.important;
    recurringTask.important = payload.important;
  }
  if (payload?.isCompleted !== undefined) {
    if (typeof payload.isCompleted !== "boolean") {
      return NextResponse.json({ ok: false, error: "Completion must be true or false." }, { status: 400 });
    }
    data.isCompleted = payload.isCompleted;
    data.completedAt = payload.isCompleted ? new Date() : null;
  }

  const parseDate = (value: unknown) => {
    if (value === null || value === "") return null;
    if (typeof value !== "string") return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };
  let recurringDueDate: Date | null | undefined;
  for (const [field, value] of [
    ["dueDate", payload?.dueDate],
    ["reminderAt", payload?.reminderAt],
  ] as const) {
    if (value === undefined) continue;
    const date = parseDate(value);
    if (date === undefined) {
      return NextResponse.json({ ok: false, error: `Invalid ${field}.` }, { status: 400 });
    }
    data[field] = date;
    if (field === "reminderAt" && (date?.getTime() ?? null) !== (existing.reminderAt?.getTime() ?? null)) {
      data.reminderProcessedAt = null;
    }
    if (field === "dueDate") recurringDueDate = date;
  }

  let myDayDate: Date | null | undefined;
  if (payload?.myDayDate !== undefined) {
    myDayDate = parseDate(payload.myDayDate);
    if (myDayDate === undefined) {
      return NextResponse.json({ ok: false, error: "Invalid My Day date." }, { status: 400 });
    }
  }

  if (payload?.repeat !== undefined) {
    if (payload.repeat !== null && !Object.values(TodoRepeat).includes(payload.repeat as TodoRepeat)) {
      return NextResponse.json({ ok: false, error: "Choose a valid repeat interval." }, { status: 400 });
    }
    data.repeat = payload.repeat as TodoRepeat | null;
  }

  if (payload?.listId !== undefined) {
    if (typeof payload.listId !== "string") {
      return NextResponse.json({ ok: false, error: "List id must be text." }, { status: 400 });
    }
    const list = await prisma.todoList.findFirst({
      where: { id: payload.listId, ...accessibleTodoListWhere(user.id) },
      select: { id: true },
    });
    if (!list) {
      return NextResponse.json({ ok: false, error: "List not found or access denied." }, { status: 404 });
    }
    data.list = { connect: { id: list.id } };
  }

  const completingRecurringTask =
    payload?.isCompleted === true && !existing.isCompleted && existing.repeat;
  const updated = await prisma.$transaction(async (transaction) => {
    if (completingRecurringTask) {
      const completion = await transaction.todoTask.updateMany({
        where: { id, isCompleted: false },
        data,
      });
      if (completion.count === 1) {
        await transaction.todoTask.create({
          data: {
            ...recurringTask,
            dueDate: nextRepeatDate(
              recurringDueDate === undefined
                ? existing.dueDate ?? new Date()
                : recurringDueDate ?? new Date(),
              existing.repeat!,
            ),
            repeat: existing.repeat,
            listId: typeof payload?.listId === "string" ? payload.listId : existing.listId,
            creatorId: user.id,
            steps: { create: existing.steps.map((step) => ({ title: step.title })) },
          },
        });
      }
    } else {
      await transaction.todoTask.update({ where: { id }, data });
    }

    if (data.reminderProcessedAt === null || payload?.isCompleted === true) {
      // Keep old receipts for deduplication, but suppress obsolete desktop alerts.
      await transaction.notification.updateMany({
        where: { todoTaskId: id, type: "PERSONAL_TASK_REMINDER", desktopClaimedAt: null },
        data: { desktopClaimedAt: new Date() },
      });
    }

    if (myDayDate !== undefined) {
      if (!myDayDate) {
        await transaction.todoMyDayEntry.deleteMany({
          where: { userId: user.id, taskId: id },
        });
      } else {
        await transaction.todoMyDayEntry.upsert({
          where: { userId_taskId: { userId: user.id, taskId: id } },
          update: { date: myDayDate },
          create: { userId: user.id, taskId: id, date: myDayDate },
        });
      }
    }
    return transaction.todoTask.findUniqueOrThrow({
      where: { id },
      include: {
        list: { select: { id: true, name: true, ownerId: true } },
        steps: { orderBy: { createdAt: "asc" } },
        myDayEntries: { where: { userId: user.id }, select: { date: true } },
      },
    });
  });
  return NextResponse.json({ ok: true, task: addMyDayDate(updated) });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const task = await findAccessibleTodoTask(id, user.id);
  if (!task) {
    return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
  }
  await prisma.todoTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
