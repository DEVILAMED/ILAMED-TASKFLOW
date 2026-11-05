"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceSwitcher } from "@/app/workspace-switcher";
import NotificationsInbox from "@/app/notifications-inbox";
import ThemeToggle from "@/app/theme-toggle";
import GlobalSearch from "@/app/global-search";
import { CalendarDays, Check, Folder, Inbox, List, Plus, Search, Share2, Star, Sun, X, type LucideIcon } from "lucide-react";

type TodoList = {
  id: string;
  name: string;
  isInbox: boolean;
  ownerId: string;
  _count?: { tasks: number };
};

type TodoStep = {
  id: string;
  title: string;
  isCompleted: boolean;
};

type TodoTask = {
  id: string;
  title: string;
  note: string | null;
  isCompleted: boolean;
  important: boolean;
  dueDate: string | null;
  reminderAt: string | null;
  myDayDate: string | null;
  repeat: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | null;
  listId: string;
  list: { id: string; name: string; ownerId: string };
  steps: TodoStep[];
};

type View = "my-day" | "important" | "planned" | "all" | "list";
type Person = { id: string; name: string | null; email: string };
type TodoWorkspaceProps = {
  lists: TodoList[];
  userId: string;
  userName: string;
  userEmail: string;
};

const viewTitles: Record<Exclude<View, "list">, string> = {
  "my-day": "My Day",
  important: "Important",
  planned: "Planned",
  all: "All tasks",
};

const repeatLabels: Record<NonNullable<TodoTask["repeat"]>, string> = {
  DAILY: "Every day",
  WEEKLY: "Every week",
  MONTHLY: "Every month",
  YEARLY: "Every year",
};

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toDateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateValue(value: FormDataEntryValue | null, endOfDay = false) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(endOfDay && value.length === 10 ? `${value}T23:59:00` : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDue(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, tomorrow)) return "Tomorrow";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: "sun" | "star" | "calendar" | "inbox" | "search" | "plus" | "list" | "folder" | "check" | "close" | "share";
  className?: string;
}) {
  const icons: Record<typeof name, LucideIcon> = {
    sun: Sun, star: Star, calendar: CalendarDays, inbox: Inbox, search: Search,
    plus: Plus, list: List, folder: Folder, check: Check, close: X, share: Share2,
  };
  const IconComponent = icons[name];
  return <IconComponent className={className} size={20} strokeWidth={1.7} aria-hidden="true" />;
}

export default function TodoWorkspace({
  lists: initialLists,
  userId,
  userName,
  userEmail,
}: TodoWorkspaceProps) {
  const [lists, setLists] = useState(initialLists);
  const [view, setView] = useState<View>("my-day");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [suggestions, setSuggestions] = useState<TodoTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newListName, setNewListName] = useState("");
  const [showNewList, setShowNewList] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [members, setMembers] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const notifiedReminders = useRef(new Set<string>());

  const activeList = lists.find((list) => list.id === selectedListId) ?? null;
  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? null;
  const viewTitle = view === "list" ? activeList?.name ?? "List" : viewTitles[view];

  const loadTasks = useCallback(async () => {
    const params = new URLSearchParams({ view, q: search });
    if (view === "list" && selectedListId) params.set("listId", selectedListId);
    if (view === "my-day") params.set("date", todayKey());
    const taskRequest = fetch(`/api/personal-tasks?${params}`);
    const suggestionsRequest =
      view === "my-day"
        ? fetch(`/api/personal-tasks?view=suggestions&date=${todayKey()}&q=${encodeURIComponent(search)}`)
        : Promise.resolve(null);
    const [response, suggestionsResponse] = await Promise.all([
      taskRequest,
      suggestionsRequest,
    ]);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to load tasks.");
      return;
    }
    setTasks(data.tasks);
    if (suggestionsResponse) {
      const suggestionsData = await suggestionsResponse.json();
      if (suggestionsResponse.ok) setSuggestions(suggestionsData.tasks);
    } else {
      setSuggestions([]);
    }
    setActiveTaskId((current) =>
      current && data.tasks.some((task: TodoTask) => task.id === current)
        ? current
        : data.tasks[0]?.id ?? null,
    );
    setError(null);
  }, [search, selectedListId, view]);

  const loadLists = useCallback(async () => {
    const response = await fetch("/api/todo-lists");
    const data = await response.json();
    if (response.ok) setLists(data.lists);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadTasks();
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [loadTasks]);

  useEffect(() => {
    let cancelled = false;
    async function checkReminders() {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try {
        const response = await fetch("/api/personal-tasks?view=all");
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        const now = Date.now();
        for (const task of data.tasks as TodoTask[]) {
          if (
            !task.isCompleted &&
            task.reminderAt &&
            new Date(task.reminderAt).getTime() <= now &&
            !notifiedReminders.current.has(task.id)
          ) {
            notifiedReminders.current.add(task.id);
            new Notification(task.title, {
              body: task.note || `Reminder from ${task.list.name}`,
              tag: `ilamed-${task.id}`,
            });
          }
        }
      } catch (requestError) {
        console.error("Unable to check task reminders.", requestError);
      }
    }

    void checkReminders();
    const interval = window.setInterval(() => void checkReminders(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const completedCount = useMemo(
    () => tasks.filter((task) => task.isCompleted).length,
    [tasks],
  );

  function chooseView(nextView: View, listId: string | null = null) {
    setView(nextView);
    setSelectedListId(listId);
    setActiveTaskId(null);
    setSearch("");
    setError(null);
  }

  async function sendTaskUpdate(taskId: string, changes: Record<string, unknown>) {
    const response = await fetch(`/api/personal-tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to update task.");
      return false;
    }
    await Promise.all([loadTasks(), loadLists()]);
    return true;
  }

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) return;
    const listId = selectedListId ?? lists.find((list) => list.isInbox)?.id;
    const response = await fetch("/api/personal-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        listId,
        myDayDate: view === "my-day" ? `${todayKey()}T00:00:00.000Z` : null,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to create task.");
      return;
    }
    setNewTaskTitle("");
    await Promise.all([loadTasks(), loadLists()]);
    setActiveTaskId(data.task.id);
  }

  async function createList(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    const response = await fetch("/api/todo-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to create list.");
      return;
    }
    setNewListName("");
    setShowNewList(false);
    await loadLists();
    chooseView("list", data.list.id);
  }

  async function openShareDialog() {
    if (!activeList) return;
    const response = await fetch(`/api/todo-lists/${activeList.id}/members`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to load list members.");
      return;
    }
    setMembers([data.owner, ...data.members]);
    setShowShare(true);
  }

  async function shareList(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeList) return;
    const response = await fetch(`/api/todo-lists/${activeList.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: shareEmail }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to share list.");
      return;
    }
    setMembers((current) => [...current, data.member]);
    setShareEmail("");
    setError(null);
  }

  async function removeMember(email: string) {
    if (!activeList) return;
    const response = await fetch(`/api/todo-lists/${activeList.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to remove member.");
      return;
    }
    setMembers((current) => current.filter((member) => member.email !== email));
  }

  async function renameList() {
    if (!activeList || activeList.ownerId !== userId || activeList.isInbox) return;
    const name = window.prompt("Rename list", activeList.name)?.trim();
    if (!name || name === activeList.name) return;
    const response = await fetch(`/api/todo-lists/${activeList.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to rename list.");
      return;
    }
    await loadLists();
  }

  async function deleteList() {
    if (!activeList || activeList.ownerId !== userId || activeList.isInbox) return;
    if (!window.confirm(`Delete "${activeList.name}" and all tasks in it?`)) return;
    const response = await fetch(`/api/todo-lists/${activeList.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to delete list.");
      return;
    }
    setActiveTaskId(null);
    chooseView("my-day");
    await loadLists();
  }

  async function addStep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTask) return;
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("step") || "").trim();
    if (!title) return;
    const response = await fetch(`/api/personal-tasks/${activeTask.id}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to add step.");
      return;
    }
    await loadTasks();
  }

  async function updateStep(stepId: string, changes: Record<string, unknown>) {
    if (!activeTask) return;
    const response = await fetch(`/api/personal-tasks/${activeTask.id}/steps/${stepId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Unable to update step.");
    else await loadTasks();
  }

  async function deleteTask() {
    if (!activeTask) return;
    if (!window.confirm(`Delete "${activeTask.title}"?`)) return;
    const response = await fetch(`/api/personal-tasks/${activeTask.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to delete task.");
      return;
    }
    setActiveTaskId(null);
    await Promise.all([loadTasks(), loadLists()]);
  }

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      setError("Unable to sign out. Please try again.");
      return;
    }
    window.location.assign("/login");
  }

  async function removeStep(stepId: string) {
    if (!activeTask) return;
    const response = await fetch(`/api/personal-tasks/${activeTask.id}/steps/${stepId}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to delete step.");
      return;
    }
    await loadTasks();
  }

  return (
    <main className="todo-app min-h-screen text-slate-800">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="todo-sidebar flex w-full shrink-0 flex-col px-4 py-5 lg:min-h-screen lg:w-[272px] lg:px-5">
          <Link href="/" className="block w-fit max-w-full rounded bg-white">
            <Image src="/company-logo.png" alt="ILAMED International institutional logo" width={2164} height={746} className="h-auto w-full max-w-[232px] object-contain" priority />
          </Link>

          <div className="mt-7 flex items-center gap-3 rounded-2xl bg-white/70 p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-800">
              {(userName || userEmail).slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{userName}</span>
              <span className="block truncate text-xs text-slate-500">{userEmail}</span>
            </span>
          </div>

          <div className="mt-4 px-1">
            <WorkspaceSwitcher current="personal" />
          </div>

          <nav className="mt-7 grid grid-cols-2 gap-1 lg:grid-cols-1">
            {([
              ["my-day", "My Day", "sun"],
              ["important", "Important", "star"],
              ["planned", "Planned", "calendar"],
              ["all", "All tasks", "inbox"],
            ] as const).map(([key, label, icon]) => (
              <button
                type="button"
                key={key}
                onClick={() => chooseView(key)}
                className={`todo-nav-item ${view === key ? "todo-nav-active" : ""}`}
              >
                <Icon name={icon} className="h-[18px] w-[18px]" />
                <span>{label}</span>
                {key === "my-day" && view === key ? (
                  <span className="ml-auto text-xs text-slate-400">{tasks.filter((task) => !task.isCompleted).length}</span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="mt-8 flex items-center justify-between px-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Your lists</p>
            <button type="button" onClick={() => setShowNewList((open) => !open)} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Create list">
              <Icon name="plus" className="h-4 w-4" />
            </button>
          </div>
          {showNewList ? (
            <form onSubmit={createList} className="mt-2 flex gap-2">
              <input autoFocus value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="List name" maxLength={60} className="todo-input min-w-0 flex-1" />
              <button className="todo-icon-button" type="submit" aria-label="Save list"><Icon name="check" className="h-4 w-4" /></button>
            </form>
          ) : null}
          <div className="mt-2 grid gap-1">
            {lists.map((list) => (
              <button
                type="button"
                key={list.id}
                onClick={() => chooseView("list", list.id)}
                className={`todo-nav-item ${view === "list" && selectedListId === list.id ? "todo-nav-active" : ""}`}
              >
                <Icon name={list.isInbox ? "inbox" : "list"} className="h-[18px] w-[18px]" />
                <span className="min-w-0 flex-1 truncate text-left">{list.name}</span>
                {list._count?.tasks ? <span className="text-xs text-slate-400">{list._count.tasks}</span> : null}
              </button>
            ))}
          </div>

          <div className="mt-auto pt-8">
            <p className="px-3 pt-5 text-[11px] leading-5 text-slate-400">Small steps count. Keep today kind and doable.</p>
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-4 flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-white hover:text-indigo-700"
              title="Sign out"
            >
              Logout
            </button>
          </div>
        </aside>

        <section className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="flex flex-col gap-4 border-b border-slate-200/80 bg-white/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <p className="text-xs font-medium text-slate-400">
                {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{viewTitle}</h1>
            </div>
            <label className="flex h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-400 sm:max-w-xs">
              <Icon name="search" className="h-[18px] w-[18px]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
              {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><Icon name="close" className="h-4 w-4" /></button> : null}
            </label>
            <div className="flex items-center gap-2"><GlobalSearch /><NotificationsInbox /><ThemeToggle /><button
              type="button"
              onClick={async () => {
                if (!("Notification" in window)) { setError("This browser does not support desktop notifications."); return; }
                const permission = await Notification.requestPermission();
                setRemindersEnabled(permission === "granted");
                if (permission !== "granted") setError("Allow notifications in your browser to receive reminders while ILAMED is open.");
                else setError(null);
              }}
              className="todo-secondary-button shrink-0"
            >{remindersEnabled ? "Reminders on" : "Enable reminders"}</button></div>
          </header>

          <div className="flex min-h-0 flex-1">
            <section className="min-w-0 flex-1 px-5 py-6 sm:px-8">
              <div className="mx-auto max-w-3xl">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-500">
                      {view === "my-day" ? "Choose a few things that matter today." : view === "important" ? "Keep the most important things close." : view === "planned" ? "Everything with a date, in one place." : "One list for everything on your plate."}
                    </p>
                    {view === "my-day" && tasks.length ? (
                      <p className="mt-2 text-xs font-medium text-slate-400">{completedCount} of {tasks.length} complete</p>
                    ) : null}
                  </div>
                  {activeList && activeList.ownerId === userId && !activeList.isInbox ? (
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => void openShareDialog()} className="todo-secondary-button">
                        <Icon name="share" className="h-4 w-4" /> Share
                      </button>
                      <button type="button" onClick={() => void renameList()} className="todo-secondary-button">Rename</button>
                      <button type="button" onClick={() => void deleteList()} className="todo-secondary-button text-rose-600 hover:text-rose-700">Delete</button>
                    </div>
                  ) : null}
                </div>

                {error ? <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
                  <form onSubmit={createTask} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
                    <span className="text-indigo-500"><Icon name="plus" className="h-5 w-5" /></span>
                    <input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder="Add a task" maxLength={200} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-slate-400" />
                    <button type="submit" disabled={!newTaskTitle.trim()} className="todo-primary-button px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">Add</button>
                  </form>
                  {tasks.length ? (
                    <div className="divide-y divide-slate-100">
                      {tasks.map((task) => (
                        <article key={task.id} className={`group flex items-start gap-3 px-4 py-3.5 transition hover:bg-slate-50/80 sm:px-5 ${activeTaskId === task.id ? "bg-indigo-50/60" : ""}`}>
                          <button
                            type="button"
                            onClick={() => void sendTaskUpdate(task.id, { isCompleted: !task.isCompleted })}
                            aria-label={task.isCompleted ? "Mark task incomplete" : "Complete task"}
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${task.isCompleted ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-indigo-500"}`}
                          >
                            {task.isCompleted ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                          </button>
                          <button type="button" onClick={() => setActiveTaskId(task.id)} className="min-w-0 flex-1 text-left">
                            <span className={`block truncate text-sm ${task.isCompleted ? "text-slate-400 line-through" : "font-medium text-slate-800"}`}>{task.title}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              {task.note ? <span className="max-w-[260px] truncate">{task.note}</span> : null}
                              {view !== "list" ? <span>{task.list.name}</span> : null}
                              {task.dueDate ? <span className="text-indigo-600">{formatDue(task.dueDate)}</span> : null}
                              {task.repeat ? <span>↻ {repeatLabels[task.repeat]}</span> : null}
                              {task.steps.length ? <span>{task.steps.filter((step) => step.isCompleted).length}/{task.steps.length} steps</span> : null}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void sendTaskUpdate(task.id, { important: !task.important })}
                            aria-label={task.important ? "Remove importance" : "Mark important"}
                            className={`mt-0.5 shrink-0 rounded-lg p-1.5 transition ${task.important ? "text-amber-500" : "text-slate-300 opacity-0 group-hover:opacity-100 hover:text-amber-500"}`}
                          >
                            <Icon name="star" className="h-4 w-4" />
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="px-6 py-14 text-center">
                      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500"><Icon name={view === "my-day" ? "sun" : "check"} /></span>
                      <p className="mt-4 text-sm font-semibold text-slate-700">{search ? "No matching tasks" : "A little breathing room"}</p>
                      <p className="mt-1 text-sm text-slate-400">{search ? "Try another search." : "Add a task above whenever you’re ready."}</p>
                    </div>
                  )}
                  {view === "my-day" ? (
                    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs text-slate-400">
                      <span>{tasks.length - completedCount} remaining</span>
                      <span>{todayKey()}</span>
                    </div>
                  ) : null}
                </div>
                {view === "my-day" && suggestions.length ? (
                  <section className="mt-7">
                    <div className="mb-3">
                      <h2 className="text-sm font-semibold text-slate-700">A few ideas</h2>
                      <p className="mt-1 text-xs text-slate-400">Important or upcoming tasks you could bring into today.</p>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      {suggestions.slice(0, 5).map((task) => (
                        <div key={task.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:px-5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-700">{task.title}</span>
                            <span className="mt-1 block text-xs text-slate-400">{task.dueDate ? `Due ${formatDue(task.dueDate)}` : task.list.name}</span>
                          </span>
                          <button type="button" onClick={() => void sendTaskUpdate(task.id, { myDayDate: `${todayKey()}T00:00:00.000Z` })} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">Add to today</button>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </section>

            {activeTask ? (
              <aside className="todo-detail-panel fixed inset-x-0 bottom-0 z-30 max-h-[85vh] overflow-y-auto border-t border-slate-200 bg-white px-5 py-5 shadow-2xl shadow-slate-900/10 sm:px-7 lg:static lg:max-h-none lg:w-[360px] lg:shrink-0 lg:border-l lg:border-t-0 lg:shadow-none">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => void sendTaskUpdate(activeTask.id, { isCompleted: !activeTask.isCompleted })}
                    aria-label={activeTask.isCompleted ? "Mark task incomplete" : "Complete task"}
                    className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${activeTask.isCompleted ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-indigo-500"}`}
                  >
                    {activeTask.isCompleted ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                  </button>
                  <form
                    key={activeTask.id}
                    className="min-w-0 flex-1"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      const reminderAt = dateValue(formData.get("reminderAt"));
                      if (reminderAt && "Notification" in window && Notification.permission === "default") {
                        const permission = await Notification.requestPermission();
                        setRemindersEnabled(permission === "granted");
                      }
                      await sendTaskUpdate(activeTask.id, {
                        title: formData.get("title"),
                        note: formData.get("note"),
                        listId: formData.get("listId"),
                        dueDate: dateValue(formData.get("dueDate"), true),
                        reminderAt,
                        repeat: formData.get("repeat") || null,
                      });
                    }}
                  >
                    <input name="title" defaultValue={activeTask.title} maxLength={200} className="w-full border-0 bg-transparent text-lg font-semibold leading-7 text-slate-900 outline-none" />
                    <textarea name="note" defaultValue={activeTask.note || ""} placeholder="Add a note" rows={3} className="mt-3 w-full resize-none rounded-xl bg-slate-50 p-3 text-sm text-slate-600 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-100" />

                    <div className="mt-4 grid gap-3">
                      <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
                        List
                        <select name="listId" defaultValue={activeTask.listId} className="todo-input w-full">
                          {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
                        Due date
                        <input name="dueDate" type="date" defaultValue={toDateInput(activeTask.dueDate)} className="todo-input w-full" />
                      </label>
                      <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
                        Reminder (while ILAMED is open)
                        <input name="reminderAt" type="datetime-local" defaultValue={toDateTimeInput(activeTask.reminderAt)} className="todo-input w-full" />
                      </label>
                      <label className="grid gap-1.5 text-xs font-semibold text-slate-500">
                        Repeat
                        <select name="repeat" defaultValue={activeTask.repeat || ""} className="todo-input w-full">
                          <option value="">Does not repeat</option>
                          <option value="DAILY">Every day</option>
                          <option value="WEEKLY">Every week</option>
                          <option value="MONTHLY">Every month</option>
                          <option value="YEARLY">Every year</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="submit" className="todo-primary-button">Save details</button>
                      <button
                        type="button"
                        onClick={() => void sendTaskUpdate(activeTask.id, {
                          myDayDate: activeTask.myDayDate ? null : `${todayKey()}T00:00:00.000Z`,
                        })}
                        className="todo-secondary-button"
                      >
                        <Icon name="sun" className="h-4 w-4" />
                        {activeTask.myDayDate ? "Remove from My Day" : "Add to My Day"}
                      </button>
                    </div>
                  </form>
                  <button type="button" onClick={() => setActiveTaskId(null)} aria-label="Close task details" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><Icon name="close" className="h-4 w-4" /></button>
                </div>

                <div className="mt-7 border-t border-slate-100 pt-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-800">Steps</h2>
                    <span className="text-xs text-slate-400">{activeTask.steps.filter((step) => step.isCompleted).length}/{activeTask.steps.length}</span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {activeTask.steps.map((step) => (
                      <label key={step.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-600">
                        <input type="checkbox" checked={step.isCompleted} onChange={(event) => void updateStep(step.id, { isCompleted: event.target.checked })} className="h-4 w-4 accent-indigo-600" />
                        <span className={`min-w-0 flex-1 ${step.isCompleted ? "text-slate-400 line-through" : ""}`}>{step.title}</span>
                        <button type="button" onClick={() => void removeStep(step.id)} aria-label={`Delete ${step.title}`} className="text-slate-300 hover:text-rose-500"><Icon name="close" className="h-4 w-4" /></button>
                      </label>
                    ))}
                    <form onSubmit={addStep} className="mt-1 flex items-center gap-2">
                      <Icon name="plus" className="h-4 w-4 text-indigo-500" />
                      <input name="step" placeholder="Add a step" className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none placeholder:text-slate-400" />
                      <button type="submit" className="text-xs font-semibold text-indigo-600">Add</button>
                    </form>
                  </div>
                </div>
                <div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-400">
                  <span>In {activeTask.list.name}</span>
                  <button type="button" onClick={() => void deleteTask()} className="font-medium text-rose-500 hover:text-rose-700">Delete task</button>
                </div>
              </aside>
            ) : null}
          </div>
        </section>
      </div>

      {showShare && activeList ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowShare(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="share-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Shared list</p><h2 id="share-title" className="mt-1 text-xl font-semibold">{activeList.name}</h2></div>
              <button type="button" onClick={() => setShowShare(false)} aria-label="Close sharing dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><Icon name="close" className="h-4 w-4" /></button>
            </div>
            <form onSubmit={shareList} className="mt-5 flex gap-2">
              <input type="email" required value={shareEmail} onChange={(event) => setShareEmail(event.target.value)} placeholder="teammate@example.com" className="todo-input min-w-0 flex-1" />
              <button type="submit" className="todo-primary-button">Invite</button>
            </form>
            {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
            <div className="mt-5 divide-y divide-slate-100">
              {members.map((member, index) => (
                <div key={member.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{(member.name || member.email).slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.name || member.email}</p><p className="truncate text-xs text-slate-400">{member.email}</p></div>
                  {index === 0 ? <span className="text-xs text-slate-400">Owner</span> : <button type="button" onClick={() => void removeMember(member.email)} className="text-xs text-rose-500 hover:text-rose-700">Remove</button>}
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
