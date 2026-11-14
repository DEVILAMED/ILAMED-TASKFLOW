import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessibleTodoListWhere, ensureInboxList } from "@/lib/todo-access";
import TodoWorkspace from "./todo-workspace";

export default async function TodosPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  await ensureInboxList(user.id);
  const [lists, tasks] = await Promise.all([prisma.todoList.findMany({
    where: accessibleTodoListWhere(user.id),
    orderBy: [{ isInbox: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      isInbox: true,
      ownerId: true,
      _count: { select: { tasks: { where: { isCompleted: false } } } },
    },
  }), prisma.todoTask.findMany({
    where: { list: accessibleTodoListWhere(user.id) },
    orderBy: [{ createdAt: "desc" }],
    include: { list: { select: { id: true, name: true, ownerId: true } }, steps: { orderBy: { createdAt: "asc" } }, myDayEntries: { where: { userId: user.id }, select: { date: true } } },
  })]);

  return (
    <TodoWorkspace
      lists={lists}
      initialTasks={tasks.map(({ myDayEntries, ...task }) => ({ ...task, dueDate: task.dueDate?.toISOString() ?? null, reminderAt: task.reminderAt?.toISOString() ?? null, myDayDate: myDayEntries[0]?.date.toISOString() ?? null, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() }))}
      userId={user.id}
      userName={user.name || user.email}
    />
  );
}
