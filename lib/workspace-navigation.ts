export type WorkspaceRole = "ADMIN" | "MANAGER" | "USER";

export type WorkspaceNavItem = {
  href: string;
  label: string;
  icon: "dashboard" | "board" | "approvals" | "calendar" | "activity" | "team" | "reports" | "notifications" | "sun" | "star" | "lists";
};

const navigation: Record<WorkspaceRole, readonly WorkspaceNavItem[]> = {
  ADMIN: [
    { href: "/admin/overview", label: "Dashboard", icon: "dashboard" },
    { href: "/admin", label: "Tasks", icon: "board" },
    { href: "/reviews", label: "Approvals", icon: "approvals" },
    { href: "/admin?view=calendar", label: "Calendar", icon: "calendar" },
    { href: "/performance", label: "Team Performance", icon: "activity" },
    { href: "/admin/employees", label: "Team", icon: "team" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/notifications", label: "Notifications", icon: "notifications" },
  ],
  MANAGER: [
    { href: "/manager", label: "Team overview", icon: "dashboard" },
    { href: "/company-tasks", label: "My tasks", icon: "board" },
    { href: "/departments", label: "My department", icon: "team" },
    { href: "/reviews", label: "Review queue", icon: "approvals" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/notifications", label: "Notifications", icon: "notifications" },
  ],
  USER: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/company-tasks", label: "Tasks", icon: "board" },
    { href: "/reviews", label: "Approvals", icon: "approvals" },
    { href: "/company-tasks?view=calendar", label: "Calendar", icon: "calendar" },
    { href: "/performance", label: "My Performance", icon: "activity" },
    { href: "/notifications", label: "Notifications", icon: "notifications" },
  ],
};

const personalNavigation: readonly WorkspaceNavItem[] = [
  { href: "/todos", label: "Dashboard", icon: "dashboard" },
  { href: "/todos?section=tasks", label: "Tasks", icon: "board" },
  { href: "/todos?section=my-day", label: "My Day", icon: "sun" },
  { href: "/todos?section=important", label: "Important", icon: "star" },
  { href: "/todos?section=calendar", label: "Calendar", icon: "calendar" },
  { href: "/todos?section=lists", label: "Lists", icon: "lists" },
  { href: "/todos?section=reports", label: "Work Reports", icon: "reports" },
];

export function getWorkspaceNavItems(role: WorkspaceRole, workspace: "personal" | "projects" = "projects"): readonly WorkspaceNavItem[] {
  return workspace === "personal" ? personalNavigation : navigation[role];
}

export function getActiveWorkspaceNavHref(role: WorkspaceRole, pathname: string, search: string, hash: string): string | undefined {
  if (pathname === "/todos") {
    const section = new URLSearchParams(search).get("section");
    return personalNavigation.find(item => new URL(item.href, "https://workspace.local").searchParams.get("section") === section)?.href ?? "/todos";
  }
  if (role === "USER" && pathname === "/company-tasks") {
    return new URLSearchParams(search).get("view") === "calendar" ? "/company-tasks?view=calendar" : "/company-tasks";
  }
  if (role === "ADMIN") {
    if (pathname === "/admin/overview") {
      return "/admin/overview";
    }
    if (pathname === "/admin") {
      return new URLSearchParams(search).get("view") === "calendar" ? "/admin?view=calendar" : "/admin";
    }
    if (pathname === "/departments") return "/admin/employees";
  }

  return navigation[role].find((item) => item.href !== "/admin" && (pathname === item.href || pathname.startsWith(`${item.href}/`)))?.href;
}
