"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, CalendarDays, Columns3, List, Plus, RefreshCw, SlidersHorizontal, Sun } from "lucide-react";
import WorkspacePageHeading from "@/app/workspace-page-heading";
import EmployeeTaskCalendar from "@/app/employee-task-calendar";
import { employeeDayKey } from "@/lib/employee-dashboard";
import { filterPersonalTasks, personalSection, type PersonalList, type PersonalTask } from "@/lib/personal-tasks";
import PersonalOverview from "./personal-overview";
import PersonalLists from "./personal-lists";
import PersonalWorkReports from "./personal-work-reports";
import { PersonalDialog, PersonalTaskDrawer, PersonalTaskForm, type TaskChanges } from "./personal-task-dialogs";
import { PersonalTaskBoard, PersonalTaskTable } from "./personal-task-views";

const titles = { dashboard: "Personal Tasks Dashboard", tasks: "Tasks", "my-day": "My Day", important: "Important Tasks", calendar: "Calendar", lists: "My Lists" };
const descriptions = { dashboard: "Your tasks, deadlines, and progress at a glance.", tasks: "Create, organize, and track your personal work.", "my-day": "Focus on the tasks you choose to work on today.", important: "Keep your most important tasks in focus.", calendar: "Plan your work around upcoming due dates.", lists: "Organize your personal work and shared lists." };

async function request<T>(path: string, method = "GET", changes?: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, { method, cache: "no-store", ...(changes ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) } : {}) });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || "Unable to save changes. Please try again.");
  return data as T;
}

export default function TodoWorkspace({ lists: initialLists, initialTasks, userId, userName }: { lists: PersonalList[]; initialTasks: PersonalTask[]; userId: string; userName: string }) {
  const params = useSearchParams();
  const section = personalSection(params.get("section"));
  const [tasks, setTasks] = useState(initialTasks);
  const [lists, setLists] = useState(initialLists);
  const [showCreate, setShowCreate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const mutationPending = useRef(false);
  const notified = useRef(new Set<string>());
  const today = employeeDayKey();
  const activeTaskId = params.get("task");
  const activeTask = tasks.find(task => task.id === activeTaskId);
  const visibleTasks = filterPersonalTasks(tasks, new URLSearchParams(params.toString()), today);
  const selectedList = lists.find(list => list.id === params.get("list"));
  const board = params.get("view") === "board";

  const setParams = useCallback((changes: Record<string, string | null>, push = false) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(changes)) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
    window.history[push ? "pushState" : "replaceState"](null, "", url);
  }, []);
  const openTask = (id: string) => { setError(null); setParams({ task: id }, true); };
  const closeTask = () => setParams({ task: null });
  const reload = useCallback(async () => {
    const [taskData, listData] = await Promise.all([request<{ tasks: PersonalTask[] }>("/api/personal-tasks?view=all"), request<{ lists: PersonalList[] }>("/api/todo-lists")]);
    setTasks(taskData.tasks); setLists(listData.lists);
  }, []);

  async function mutate(action: () => Promise<void>, message: string): Promise<boolean> {
    if (mutationPending.current) return false;
    mutationPending.current = true; setPending(true); setError(null); setNotice(null);
    try {
      await action(); setNotice(message);
      try { await reload(); } catch { setError("Your changes were saved, but the task list could not refresh. Choose Refresh to try again."); }
      return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save changes. Please try again."); return false; }
    finally { mutationPending.current = false; setPending(false); }
  }
  async function updateTask(id: string, changes: TaskChanges) {
    return mutate(async () => {
      const data = await request<{ task: PersonalTask }>(`/api/personal-tasks/${id}`, "PATCH", changes);
      setTasks(current => current.map(task => task.id === id ? data.task : task));
    }, "Task updated.");
  }
  async function createTask(changes: TaskChanges) {
    let createdId: string | undefined;
    const ok = await mutate(async () => {
      const data = await request<{ task: PersonalTask }>("/api/personal-tasks", "POST", changes);
      setTasks(current => [data.task, ...current]); createdId = data.task.id;
    }, "Task created.");
    if (ok) { setShowCreate(false); if (createdId) openTask(createdId); }
    return ok;
  }
  async function deleteTask(id: string) {
    return mutate(async () => { await request(`/api/personal-tasks/${id}`, "DELETE"); setTasks(current => current.filter(task => task.id !== id)); closeTask(); }, "Task deleted.");
  }
  async function updateStep(taskId: string, method: "POST" | "PATCH" | "DELETE", stepId?: string, changes?: TaskChanges) {
    return mutate(async () => {
      const data = await request<{ step?: PersonalTask["steps"][number] }>(`/api/personal-tasks/${taskId}/steps${stepId ? `/${stepId}` : ""}`, method, changes);
      setTasks(current => current.map(task => task.id !== taskId ? task : { ...task, steps: method === "POST" && data.step ? [...task.steps, data.step] : method === "DELETE" ? task.steps.filter(step => step.id !== stepId) : task.steps.map(step => step.id === stepId && data.step ? data.step : step) }));
    }, "Checklist updated.");
  }
  async function manageList(path: string, method: "POST" | "PATCH" | "DELETE", changes?: TaskChanges) {
    return mutate(async () => {
      const data = await request<{ list?: PersonalList }>(path, method, changes);
      if (method === "POST" && data.list) setLists(current => [...current, data.list!]);
      if (method === "PATCH" && data.list) setLists(current => current.map(list => list.id === data.list!.id ? data.list! : list));
      if (method === "DELETE") { const id = path.split("/").pop(); setLists(current => current.filter(list => list.id !== id)); setTasks(current => current.filter(task => task.listId !== id)); }
    }, method === "DELETE" ? "List deleted." : "List saved.");
  }
  async function enableReminders() {
    if (!("Notification" in window)) { setError("This browser does not support desktop reminders."); return; }
    const permission = await Notification.requestPermission();
    setRemindersEnabled(permission === "granted");
    if (permission !== "granted") setError("Allow notifications in your browser settings to receive task reminders.");
    else setNotice("Desktop reminders enabled while this workspace is open.");
  }
  useEffect(() => { if ("Notification" in window) setRemindersEnabled(Notification.permission === "granted"); }, []);
  useEffect(() => {
    if (!remindersEnabled) return;
    let stopped = false;
    async function check() {
      try {
        const data = await request<{ tasks: PersonalTask[] }>("/api/personal-tasks?view=all");
        if (stopped || Notification.permission !== "granted") return;
        for (const task of data.tasks) {
          const key = `${task.id}:${task.reminderAt}`;
          if (!task.isCompleted && task.reminderAt && new Date(task.reminderAt).getTime() <= Date.now() && !notified.current.has(key)) {
            notified.current.add(key);
            new Notification(task.title, { body: task.note || `Reminder from ${task.list.name}`, tag: `ilamed-${task.id}` });
          }
        }
      } catch { /* A temporary polling failure is retried at the next interval. */ }
    }
    void check(); const interval = window.setInterval(() => void check(), 30_000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [remindersEnabled]);

  const onUpdate = (id: string, changes: TaskChanges) => { void updateTask(id, changes); };
  const taskViews = ["tasks", "my-day", "important"].includes(section);
  const suggestions = section === "my-day" ? tasks.filter(task => !task.isCompleted && task.myDayDate?.slice(0, 10) !== today && (task.important || task.dueDate && task.dueDate.slice(0, 10) <= today)).slice(0, 4) : [];
  if (section === "reports") return <PersonalWorkReports userName={userName}/>;
  return <div className="workspace-view personal-workspace">
    <WorkspacePageHeading kicker={section === "dashboard" ? "MY WORKSPACE" : section === "calendar" ? "TIMELINE" : "PERSONAL WORKFLOW"} title={section === "tasks" && selectedList ? selectedList.name : titles[section]} description={section === "dashboard" ? `Welcome back, ${userName.split(/\s+/)[0]}. ${descriptions.dashboard}` : descriptions[section]} action={<button type="button" className="accent-button workspace-standard-button" onClick={() => { setError(null); setShowCreate(true); }}><Plus size={16}/> New Task</button>}/>
    {error ? <div role="alert" className="workspace-form-error personal-feedback">{error}<button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button></div> : null}
    {notice ? <p role="status" className="personal-notice">{notice}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification">×</button></p> : null}
    {activeTaskId && !activeTask ? <p role="status" className="personal-muted">This task is unavailable or you no longer have access. <button type="button" className="underline" onClick={closeTask}>Dismiss</button></p> : null}
    {section === "dashboard" ? <PersonalOverview tasks={tasks} lists={lists} today={today} pending={pending} onOpen={openTask} onUpdate={onUpdate}/> : null}
    {section === "lists" ? <PersonalLists lists={lists} tasks={tasks} userId={userId} pending={pending} error={error} onOpen={id => setParams({ section: "tasks", list: id, q: null, status: null, importance: null, due: null, task: null }, true)} onManage={manageList}/> : null}
    {taskViews || section === "calendar" ? <div className={`workspace-task-board is-personal ${section === "calendar" ? "is-calendar" : ""}`}>
      <div className="workspace-task-filters personal-task-filters"><input className="soft-input" aria-label="Search personal tasks" placeholder="Search tasks…" value={params.get("q") ?? ""} onChange={event => setParams({ q: event.target.value })}/><select className="soft-input" aria-label="Filter by status" value={params.get("status") ?? ""} onChange={event => setParams({ status: event.target.value })}><option value="">All statuses</option><option value="active">Not completed</option><option value="completed">Completed</option></select><select className="soft-input" aria-label="Filter by list" value={params.get("list") ?? ""} onChange={event => setParams({ list: event.target.value })}><option value="">All lists</option>{lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}</select></div>
      <div className="personal-task-toolbar"><p>{visibleTasks.length} {visibleTasks.length === 1 ? "task" : "tasks"}{selectedList ? ` in ${selectedList.name}` : ""}</p><div><button type="button" title="Refresh tasks" aria-label="Refresh tasks" disabled={pending} onClick={() => void reload().then(() => setError(null)).catch(() => setError("Unable to refresh tasks. Please try again."))}><RefreshCw size={15}/></button><button type="button" title={remindersEnabled ? "Desktop reminders enabled" : "Enable desktop reminders"} aria-label="Enable desktop reminders" disabled={remindersEnabled} onClick={() => void enableReminders()}><Bell size={15}/></button>{section !== "calendar" ? <div className="personal-view-switch" aria-label="Task display"><button type="button" aria-label="Table view" aria-pressed={!board} onClick={() => setParams({ view: null })}><List size={15}/></button><button type="button" aria-label="Board view" aria-pressed={board} onClick={() => setParams({ view: "board" })}><Columns3 size={15}/></button></div> : <CalendarDays size={15}/>}
        <details className="personal-more-filters"><summary><SlidersHorizontal size={14}/> More filters</summary><div><label className="workspace-field">Importance<select value={params.get("importance") ?? ""} onChange={event => setParams({ importance: event.target.value })}><option value="">All importance</option><option value="important">Important</option><option value="normal">Normal</option></select></label><label className="workspace-field">Due date<select value={params.get("due") ?? ""} onChange={event => setParams({ due: event.target.value })}><option value="">Any due date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="planned">Has a due date</option><option value="none">No due date</option></select></label><label className="workspace-field">Sort by<select value={params.get("sort") ?? ""} onChange={event => setParams({ sort: event.target.value })}><option value="">Due date</option><option value="important">Importance</option><option value="updated">Recently updated</option><option value="title">Task title</option></select></label><button type="button" className="secondary-button workspace-standard-button" onClick={() => setParams({ q: null, list: null, status: null, importance: null, due: null, sort: null })}>Clear filters</button></div></details>
      </div></div>
      <section className="panel-card workspace-task-results">{section === "calendar" ? <EmployeeTaskCalendar tasks={visibleTasks.map(task => ({ id: task.id, title: task.title, dueDate: task.dueDate, status: task.isCompleted ? "DONE" : "TODO" }))} onOpen={task => openTask(task.id)}/> : visibleTasks.length ? board ? <PersonalTaskBoard tasks={visibleTasks} pending={pending} onOpen={openTask} onUpdate={onUpdate}/> : <PersonalTaskTable tasks={visibleTasks} today={today} pending={pending} onOpen={openTask} onUpdate={onUpdate}/> : <div className="personal-empty"><h2>{tasks.length ? "No tasks match this view." : "Create your first personal task."}</h2><p>{section === "my-day" ? "Add tasks to My Day from their details or the suggestions below." : "Choose New Task to get started, or adjust your filters."}</p></div>}</section>
      {suggestions.length ? <section className="workspace-surface personal-suggestions"><div className="employee-panel-heading"><h2>Suggested for My Day</h2><Sun size={18}/></div><p className="personal-muted">Important tasks and upcoming deadlines from your lists.</p><div>{suggestions.map(task => <article key={task.id}><div><button type="button" className="personal-task-open" onClick={() => openTask(task.id)}>{task.title}</button><p>{task.list.name}</p></div><button type="button" className="secondary-button workspace-standard-button" disabled={pending} onClick={() => void updateTask(task.id, { myDayDate: `${today}T00:00:00.000Z` })}><Plus size={14}/> Add to My Day</button></article>)}</div></section> : null}
    </div> : null}
    {showCreate ? <PersonalDialog title="Create Personal Task" onClose={() => setShowCreate(false)}>{error ? <p role="alert" className="workspace-form-error">{error}</p> : null}<PersonalTaskForm lists={lists} defaultListId={selectedList?.id} defaultDueDate={section === "calendar" ? params.get("day") ?? today : ""} important={section === "important"} myDay={section === "my-day"} pending={pending} onSave={createTask} onCancel={() => setShowCreate(false)}/></PersonalDialog> : null}
    {activeTask ? <PersonalTaskDrawer key={activeTask.id} task={activeTask} lists={lists} pending={pending} error={error} onClose={closeTask} onUpdate={changes => updateTask(activeTask.id, changes)} onDelete={() => deleteTask(activeTask.id)} onStep={(method, stepId, changes) => updateStep(activeTask.id, method, stepId, changes)}/> : null}
  </div>;
}
