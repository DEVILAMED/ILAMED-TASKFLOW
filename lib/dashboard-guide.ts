import type { WorkspaceNavItem, WorkspaceRole } from "./workspace-navigation";

export type GuideWorkspace = "personal" | "projects";
export type GuideStep = { id: string; title: string; description: string; selectors: string[]; reveal?: "navigation" | "account" };
export type GuideRect = { top: number; left: number; width: number; height: number };
export type GuideStorage = Pick<Storage, "getItem" | "setItem">;

export function guideStorageKey(account: string, role: WorkspaceRole, workspace: GuideWorkspace) {
  return `ilamed:dashboard-guide:v1:${encodeURIComponent(account)}:${role}:${workspace}`;
}
export function hasSeenGuide(storage: GuideStorage | null, key: string) {
  try { const value = storage?.getItem(key); return value === "completed" || value === "skipped"; } catch { return false; }
}
export function rememberGuide(storage: GuideStorage | null, key: string, status: "completed" | "skipped") {
  try { storage?.setItem(key, status); } catch { /* The guide also remembers dismissal for this session. */ }
}

export function buildDashboardGuide(role: WorkspaceRole, workspace: GuideWorkspace, navigation: readonly WorkspaceNavItem[]): GuideStep[] {
  const personal = workspace === "personal";
  const steps: GuideStep[] = [{ id: "overview", title: personal ? "Your personal workspace" : role === "USER" ? "Your work at a glance" : "Your team workspace", description: personal ? "Keep personal tasks, deadlines, and daily work reports together. The dashboard summarizes your open, important, overdue, and completed tasks." : role === "USER" ? "Your dashboard brings together assigned work, deadlines, and manager feedback. Summary cards open the related tasks and views." : "Use the dashboard to check task progress, upcoming deadlines, and your team's workload. Summary cards help you focus on work that needs attention.", selectors: [".employee-dashboard-stats", ".admin-stats-grid", ".workspace-page-heading", '[data-guide="page"] > :first-child'] }];
  const addNavStep = (id: string, label: string, title: string, description: string) => {
    const item = navigation.find(item => item.label === label);
    if (item) steps.push({ id, title, description, selectors: [`[data-guide-link=${JSON.stringify(item.href)}]`], reveal: "navigation" });
  };
  addNavStep("tasks", personal || role !== "MANAGER" ? "Tasks" : "My tasks", personal ? "Create and organize tasks" : "Find your tasks", personal ? "Open Tasks to create work, search and filter your lists, or switch between table and board views. Select a task to edit its notes, due date, reminders, and checklist, then mark it complete when done." : role === "ADMIN" ? "Open Tasks to assign work, set priorities and deadlines, and track progress. Select any task to see its details, checklist, and progress updates." : "Open your task list and select a task to see its instructions and checklist. Start the task, share progress, and submit it for review when the work is ready.");
  if (personal) addNavStep("my-day", "My Day", "Choose today's focus", "Add tasks to My Day from their details or the suggested tasks. Important keeps starred work easy to find, and the main task list keeps your other work available.");
  addNavStep("calendar", "Calendar", "Plan around your deadlines", personal ? "Use Calendar to see tasks by due date. Select a day to view its agenda, then choose a task to open its details." : "Use Calendar to see upcoming deadlines and tasks due on a particular date. Choose a task to open its details.");
  if (personal) {
    addNavStep("lists", "Lists", "Keep work organized", "Group tasks into lists. You can share lists with colleagues and manage access to the lists you own.");
    addNavStep("work-reports", "Work Reports", "Daily notes become monthly reports", "Save a daily report with work completed, next steps, blockers, and optional hours. Choose a month to combine saved entries, then download the report or print it as a PDF.");
  } else {
    addNavStep("reviews", role === "MANAGER" ? "Review queue" : "Approvals", role === "USER" ? "Follow your submissions" : "Review submitted work", role === "USER" ? "Approvals shows the status of your submitted work and your manager's feedback. If changes are requested, update the task and submit it again." : "Review submitted work, add feedback and a quality rating, then approve it, request changes, or reject it. The employee receives your decision as a notification.");
    const insights = navigation.find(item => item.icon === "activity") ?? navigation.find(item => item.icon === "reports");
    if (insights) addNavStep("insights", insights.label, role === "USER" ? "See your progress" : "Track team progress", role === "USER" ? "My Performance brings together your task activity and manager review ratings, so you can see progress over time." : insights.icon === "reports" ? "Reports lets you download task and performance summaries for the work you manage." : "Team Performance shows task activity and review ratings. Use these views alongside task details and employee feedback.");
  }
  steps.push(
    { id: "notifications", title: "Stay up to date", description: "The bell shows your task assignments, progress updates, and review decisions. Open an item to go to the related work.", selectors: ['[data-guide="notifications"]'] },
    { id: "workspaces", title: "Switch between workspaces", description: "Your account menu lets you switch between Company tasks and Personal tasks. It also includes your profile, search, and appearance settings.", selectors: ['[data-guide="workspaces"]'], reveal: "account" },
    { id: "finish", title: "You're ready to get started", description: "Use this guide button whenever you want a refresher. Choose a tab to explore your workspace at your own pace.", selectors: ['[data-guide="replay"]'] },
  );
  return steps;
}

export function placeGuideCard(anchor: GuideRect | null, viewport: { width: number; height: number }, card: { width: number; height: number }) {
  const margin = 16, gap = 16;
  const width = Math.min(card.width, Math.max(0, viewport.width - margin * 2));
  const height = Math.min(card.height, Math.max(0, viewport.height - margin * 2));
  const clamp = (value: number, maximum: number) => Math.max(margin, Math.min(value, maximum - margin));
  let left = (viewport.width - width) / 2, top = (viewport.height - height) / 2;
  if (anchor) {
    const right = anchor.left + anchor.width, bottom = anchor.top + anchor.height;
    if (viewport.width - right >= width + gap + margin) { left = right + gap; top = anchor.top; }
    else if (anchor.left >= width + gap + margin) { left = anchor.left - width - gap; top = anchor.top; }
    else if (viewport.height - bottom >= height + gap + margin) { left = anchor.left; top = bottom + gap; }
    else if (anchor.top >= height + gap + margin) { left = anchor.left; top = anchor.top - height - gap; }
  }
  return { left: clamp(left, viewport.width - width), top: clamp(top, viewport.height - height) };
}
