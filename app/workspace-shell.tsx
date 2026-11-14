"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import companyLogo from "@/public/new-logo-1ilamed2026 (1).png";
import { Suspense, type ReactNode } from "react";
import { WorkspaceSwitcher } from "@/app/workspace-switcher";
import NotificationsInbox from "@/app/notifications-inbox";
import PresenceHeartbeat from "@/app/presence-heartbeat";
import GlobalSearch from "@/app/global-search";
import ThemeToggle from "@/app/theme-toggle";
import WorkspaceNavigation, { WorkspaceNavigationFallback } from "@/app/workspace-navigation";
import type { WorkspaceRole } from "@/lib/workspace-navigation";
import { Menu } from "lucide-react";
import NewCompanyTaskDialog from "@/app/new-company-task-dialog";

type WorkspaceShellProps = {
  title: string;
  currentWorkspace: "personal" | "projects";
  userName: string;
  userEmail: string;
  userRole: WorkspaceRole;
  userDesignation?: string;
  userAction?: ReactNode;
  topbarRight?: ReactNode;
  taskEmployees?: { id: string; name: string | null; email: string }[];
  children: ReactNode;
};

function Brand() {
  return <Link href="/" aria-label="ILAMED workspace home" className="workspace-brand">
    <Image src={companyLogo} alt="ILAMED International institutional logo" sizes="190px" className="workspace-brand-logo" priority />
  </Link>;
}

export function WorkspaceShell({ title, currentWorkspace, userName, userEmail, userRole, userDesignation, userAction, topbarRight, taskEmployees = [], children }: WorkspaceShellProps) {
  const pathname = usePathname();
  const activeWorkspace = pathname === "/todos" ? "personal" : currentWorkspace;
  const initials = (userName || userEmail || "U").trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const role = userDesignation || (userRole === "ADMIN" ? "Admin" : userRole === "MANAGER" ? "Manager" : "Team member");
  const navigation = <Suspense fallback={<WorkspaceNavigationFallback role={userRole} workspace={activeWorkspace} />}><WorkspaceNavigation role={userRole} workspace={activeWorkspace} /></Suspense>;
  const userProfile = <Link href="/profile" title={userEmail} className="workspace-sidebar-profile">
    <span className="workspace-avatar">{initials}</span>
    <span className="min-w-0"><span className="workspace-profile-name">{userName}</span><span className="workspace-profile-role">{role} / ILAMED</span></span>
  </Link>;
  const accountControls = <div className="workspace-account-controls">
    <Link href="/profile" className="workspace-account-link">My profile</Link>
    <GlobalSearch />
    <div className="flex items-center justify-between gap-3"><span className="text-xs text-[var(--muted)]">Appearance</span><ThemeToggle /></div>
    <WorkspaceSwitcher current={activeWorkspace} />
  </div>;

  return <div className="workspace-theme min-h-screen lg:flex">
    <PresenceHeartbeat />
    {activeWorkspace === "projects" && userRole !== "USER" ? <Suspense fallback={null}><NewCompanyTaskDialog employees={taskEmployees} /></Suspense> : null}
    <a href="#workspace-main" className="workspace-skip-link">Skip to content</a>
    <aside className="workspace-sidebar hidden shrink-0 lg:sticky lg:top-0 lg:flex lg:h-screen">
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
        <details className="workspace-mobile-nav relative lg:hidden">
          <summary aria-label="Open navigation" className="workspace-control flex h-9 w-9 items-center justify-center rounded-lg"><Menu aria-hidden="true" size={19} strokeWidth={1.8} /></summary>
          <div className="workspace-mobile-panel"><Brand />{navigation}<div className="workspace-sidebar-footer">{userProfile}<div className="workspace-signout">{userAction}</div></div></div>
        </details>
        <p className="workspace-topbar-label" title={title}>{activeWorkspace === "projects" ? "TEAM WORKSPACE" : "PERSONAL WORKSPACE"}</p>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {topbarRight ? <div className="hidden xl:block">{topbarRight}</div> : null}
          <div className="workspace-topbar-notifications"><NotificationsInbox /></div>
          <details className="workspace-account-menu">
            <summary aria-label={`Account options for ${userName}`} className="workspace-user-chip">
              <span className="workspace-avatar">{initials}</span>
              <span className="workspace-topbar-user"><span className="workspace-profile-name">{userName}</span><span className="workspace-profile-role">{role}</span></span>
            </summary>
            {accountControls}
          </details>
        </div>
      </header>
      <main id="workspace-main" tabIndex={-1} className="workspace-content"><div className="workspace-content-inner">{children}</div></main>
    </div>
  </div>;
}
