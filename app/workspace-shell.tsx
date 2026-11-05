import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { WorkspaceSwitcher } from "@/app/workspace-switcher";
import NotificationsInbox from "@/app/notifications-inbox";
import PresenceHeartbeat from "@/app/presence-heartbeat";
import GlobalSearch from "@/app/global-search";
import ThemeToggle from "@/app/theme-toggle";
import { Activity, BarChart3, Columns3, FolderKanban, Home, LayoutDashboard, Menu, UsersRound } from "lucide-react";

export type WorkspaceNavItem = {
  href: string;
  label: string;
  badge?: string;
  active?: boolean;
  icon: "dashboard" | "folder" | "activity" | "team" | "reports" | "home" | "board";
};

type WorkspaceShellProps = {
  title: string;
  currentWorkspace: "personal" | "projects";
  navItems: WorkspaceNavItem[];
  userName: string;
  userEmail: string;
  userAction?: ReactNode;
  topbarRight?: ReactNode;
  children: ReactNode;
};

function NavIcon({ name }: { name: WorkspaceNavItem["icon"] }) {
  switch (name) {
    case "team": return <UsersRound size={17} strokeWidth={1.8} />;
    case "folder": return <FolderKanban size={17} strokeWidth={1.8} />;
    case "activity": return <Activity size={17} strokeWidth={1.8} />;
    case "reports": return <BarChart3 size={17} strokeWidth={1.8} />;
    case "home": return <Home size={17} strokeWidth={1.8} />;
    case "board": return <Columns3 size={17} strokeWidth={1.8} />;
    case "dashboard": return <LayoutDashboard size={17} strokeWidth={1.8} />;
  }
}

function groupLabel(item: WorkspaceNavItem) {
  if (["Employees", "Departments", "Teams"].includes(item.label) || item.label.toLowerCase().includes("department")) return "People";
  if (["Reports", "Analytics", "Performance"].includes(item.label)) return "Insights";
  if (["Projects", "Reviews", "Review queue"].includes(item.label)) return "Work management";
  return "Workspace";
}

function NavigationGroups({ items }: { items: WorkspaceNavItem[] }) {
  const groups = new Map<string, WorkspaceNavItem[]>();
  for (const item of items) {
    const group = groupLabel(item);
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return <div className="grid gap-5">{["Workspace", "Work management", "People", "Insights"].map((group) => {
    const groupedItems = groups.get(group);
    if (!groupedItems?.length) return null;
    return <section key={group}>
      <h2 className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--subtle)]">{group}</h2>
      <div className="grid gap-0.5">{groupedItems.map((item) => <Link key={`${item.label}-${item.href}`} href={item.href} className={`workspace-nav-item group ${item.active ? "workspace-nav-active" : ""}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><NavIcon name={item.icon} /></span><span className="flex-1">{item.label}</span>{item.badge ? <span className="rounded-md bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">{item.badge}</span> : null}
      </Link>)}</div>
    </section>;
  })}</div>;
}

export function WorkspaceShell({ title, currentWorkspace, navItems, userName, userEmail, userAction, topbarRight, children }: WorkspaceShellProps) {
  const initials = (userName || userEmail || "U").slice(0, 2).toUpperCase();
  return <div className="workspace-theme min-h-screen lg:flex">
    <PresenceHeartbeat />
    <aside className="workspace-sidebar hidden w-[250px] shrink-0 flex-col border-r lg:sticky lg:top-0 lg:flex lg:h-screen">
      <Link href="/" className="flex h-[68px] shrink-0 items-center gap-2 border-b px-3">
        <Image src="/company-logo.png" alt="ILAMED International institutional logo" width={2164} height={746} className="h-auto w-[125px] shrink-0 object-contain" priority />
        <span className="shrink-0 whitespace-nowrap border-l border-[var(--stroke)] pl-2 text-[9px] font-medium tracking-wide text-[var(--muted)]">WORKSPACE</span>
      </Link>
      <div className="flex-1 overflow-y-auto px-3 py-5"><NavigationGroups items={navItems} /></div>
      <div className="border-t p-3"><WorkspaceSwitcher current={currentWorkspace} /></div>
    </aside>

    <div className="min-w-0 flex-1">
      <header className="workspace-topbar sticky top-0 z-40 flex min-h-[68px] items-center gap-3 border-b px-4 sm:px-6">
        <details className="workspace-mobile-nav relative lg:hidden">
          <summary aria-label="Open navigation" className="workspace-control flex h-10 w-10 items-center justify-center rounded-xl">
            <Menu aria-hidden="true" size={19} strokeWidth={1.8} />
          </summary>
          <div className="workspace-mobile-panel absolute left-0 top-12 z-50 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border p-3 shadow-xl">
            <Link href="/" className="mb-3 flex items-center gap-2 border-b border-[var(--stroke)] px-2 pb-3"><Image src="/company-logo.png" alt="ILAMED International institutional logo" width={2164} height={746} className="h-auto w-28" /><span className="text-[10px] text-[var(--muted)]">Workspace</span></Link>
            <NavigationGroups items={navItems} />
            <div className="mt-4 grid gap-3 border-t border-[var(--stroke)] pt-3"><WorkspaceSwitcher current={currentWorkspace} />{userAction}</div>
          </div>
        </details>
        <div className="min-w-0 flex-1 md:flex-none"><p className="hidden text-[11px] text-[var(--muted)] sm:block">Workspace / {title}</p><h1 className="truncate text-base font-semibold tracking-[-0.02em] text-[var(--foreground)] sm:mt-0.5 sm:text-lg">{title}</h1></div>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          <GlobalSearch />
          <NotificationsInbox />
          <ThemeToggle />
          {topbarRight}
          <Link href="/profile" aria-label={`Profile for ${userName}`} title={userEmail} className="workspace-user-chip flex h-10 items-center gap-2 rounded-xl px-1.5 sm:px-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-xs font-semibold text-indigo-700">{initials}</span>
            <span className="hidden min-w-0 text-left sm:block"><span className="block max-w-32 truncate text-xs font-semibold text-[var(--foreground)]">{userName}</span><span className="block text-[10px] text-[var(--muted)]">My profile</span></span>
          </Link>
          {userAction ? <div className="hidden sm:block">{userAction}</div> : null}
        </div>
      </header>
      <main className="workspace-content min-h-[calc(100vh-68px)] px-4 py-5 sm:px-6 sm:py-7 xl:px-8"><div className="mx-auto w-full max-w-[1480px]">{children}</div></main>
    </div>
  </div>;
}
