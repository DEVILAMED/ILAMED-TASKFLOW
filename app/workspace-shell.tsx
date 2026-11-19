"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import companyLogo from "@/public/new-logo-1ilamed2026 (1).png";
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { WorkspaceSwitcher } from "@/app/workspace-switcher";
import NotificationsInbox from "@/app/notifications-inbox";
import PresenceHeartbeat from "@/app/presence-heartbeat";
import PersonalTaskReminders from "@/app/personal-task-reminders";
import GlobalSearch from "@/app/global-search";
import ThemeToggle from "@/app/theme-toggle";
import WorkspaceNavigation, { WorkspaceNavigationFallback } from "@/app/workspace-navigation";
import type { WorkspaceRole } from "@/lib/workspace-navigation";
import { Menu } from "lucide-react";
import NewCompanyTaskDialog from "@/app/new-company-task-dialog";
import DashboardGuide from "@/app/dashboard-guide";
import UserAvatar from "@/app/user-avatar";
import { announceMenuOpened, installMenuDismissal } from "@/lib/dismissible-menu";

type WorkspaceShellProps = {
  title: string;
  currentWorkspace: "personal" | "projects";
  userName: string;
  userId?: string;
  userEmail: string;
  userAvatarUrl?: string | null;
  userRole: WorkspaceRole;
  userDesignation?: string;
  userAction?: ReactNode;
  topbarRight?: ReactNode;
  taskEmployees?: { id: string; name: string | null; email: string; employeeProfile?: { departmentId: string | null } | null }[];
  taskDepartments?: { id: string; name: string }[];
  children: ReactNode;
};

function Brand() {
  return <Link href="/" aria-label="ILAMED workspace home" className="workspace-brand">
    <Image src={companyLogo} alt="ILAMED International institutional logo" sizes="190px" className="workspace-brand-logo" priority />
  </Link>;
}

export function WorkspaceShell({ title, currentWorkspace, userName, userId, userEmail, userRole, userAvatarUrl, userDesignation, userAction, topbarRight, taskEmployees = [], taskDepartments = [], children }: WorkspaceShellProps) {
  const pathname = usePathname();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const cleanups = [accountMenu.current, mobileMenu.current].flatMap(container => {
      if (!container) return [];
      container.open = false;
      return [installMenuDismissal({
        container,
        trigger: container.querySelector("summary"),
        isOpen: () => container.open,
        close: () => { container.open = false; },
      })];
    });
    return () => { cleanups.forEach(cleanup => cleanup()); };
  }, [pathname]);
  const activeWorkspace = pathname === "/todos" ? "personal" : currentWorkspace;
  const role = userDesignation || (userRole === "ADMIN" ? "Admin" : userRole === "MANAGER" ? "Manager" : "Team member");
  const navigation = <Suspense fallback={<WorkspaceNavigationFallback role={userRole} workspace={activeWorkspace} />}><WorkspaceNavigation role={userRole} workspace={activeWorkspace} /></Suspense>;
  const userProfile = <Link href="/profile" title={userEmail} className="workspace-sidebar-profile">
    <UserAvatar name={userName || userEmail} src={userAvatarUrl} className="workspace-avatar" />
    <span className="min-w-0"><span className="workspace-profile-name">{userName}</span><span className="workspace-profile-role">{role} / ILAMED</span></span>
  </Link>;
  const accountControls = <div className="workspace-account-controls" onClick={event => {
    if (event.target instanceof Element && event.target.closest("a[href]") && accountMenu.current) accountMenu.current.open = false;
  }}>
    <Link href="/profile" className="workspace-account-link">My profile</Link>
    <GlobalSearch />
    <div className="flex items-center justify-between gap-3"><span className="text-xs text-[var(--muted)]">Appearance</span><ThemeToggle /></div>
    <WorkspaceSwitcher current={activeWorkspace} />
  </div>;

  return <div className="workspace-theme min-h-screen lg:flex">
    <PresenceHeartbeat />
    <PersonalTaskReminders key={userId || userEmail} />
    {activeWorkspace === "projects" && userRole !== "USER" ? <Suspense fallback={null}><NewCompanyTaskDialog employees={taskEmployees} departments={taskDepartments} /></Suspense> : null}
    <a href="#workspace-main" className="workspace-skip-link">Skip to content</a>
    <aside className="workspace-sidebar hidden shrink-0 lg:sticky lg:top-0 lg:flex lg:h-screen" data-guide="sidebar">
      <Brand />
      <div className="workspace-sidebar-divider" />
      <div className="workspace-navigation-wrap">{navigation}</div>
      <div className="workspace-sidebar-footer">
        {userProfile}
        {userAction ? <div className="workspace-signout">{userAction}</div> : null}
      </div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="workspace-topbar">
        <details ref={mobileMenu} className="workspace-mobile-nav relative lg:hidden" data-guide="mobile-menu" onToggle={event => { if (event.currentTarget.open) announceMenuOpened(event.currentTarget); }}>
          <summary aria-label="Open navigation" className="workspace-control flex h-9 w-9 items-center justify-center rounded-lg"><Menu aria-hidden="true" size={19} strokeWidth={1.8} /></summary>
          <div className="workspace-mobile-panel"><Brand />{navigation}<div className="workspace-sidebar-footer">{userProfile}<div className="workspace-signout">{userAction}</div></div></div>
        </details>
        <p className="workspace-topbar-label" title={title}>{activeWorkspace === "projects" ? "TEAM WORKSPACE" : "PERSONAL WORKSPACE"}</p>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {topbarRight ? <div className="hidden xl:block">{topbarRight}</div> : null}
          <DashboardGuide account={userId || userEmail} role={userRole} workspace={activeWorkspace}/>
          <div className="workspace-topbar-notifications" data-guide="notifications"><NotificationsInbox /></div>
          <details ref={accountMenu} className="workspace-account-menu" data-guide="account-menu" onToggle={event => { if (event.currentTarget.open) announceMenuOpened(event.currentTarget); }}>
            <summary aria-label={`Account options for ${userName}`} className="workspace-user-chip">
              <UserAvatar name={userName || userEmail} src={userAvatarUrl} className="workspace-avatar" />
              <span className="workspace-topbar-user"><span className="workspace-profile-name">{userName}</span><span className="workspace-profile-role">{role}</span></span>
            </summary>
            {accountControls}
          </details>
        </div>
      </header>
      <main id="workspace-main" tabIndex={-1} className="workspace-content"><div className="workspace-content-inner" data-guide="page">{children}</div></main>
    </div>
  </div>;
}
