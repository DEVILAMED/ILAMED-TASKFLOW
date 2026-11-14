"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { Activity, BarChart3, Bell, CalendarDays, CheckSquare, Columns3, Folder, LayoutDashboard, Star, Sun, UsersRound } from "lucide-react";
import { getActiveWorkspaceNavHref, getWorkspaceNavItems, type WorkspaceNavItem, type WorkspaceRole } from "@/lib/workspace-navigation";

function NavIcon({ name }: { name: WorkspaceNavItem["icon"] }) {
  const props = { size: 16, strokeWidth: 1.6, "aria-hidden": true as const };
  switch (name) {
    case "team": return <UsersRound {...props} />;
    case "activity": return <Activity {...props} />;
    case "reports": return <BarChart3 {...props} />;
    case "board": return <Columns3 {...props} />;
    case "calendar": return <CalendarDays {...props} />;
    case "approvals": return <CheckSquare {...props} />;
    case "dashboard": return <LayoutDashboard {...props} />;
    case "notifications": return <Bell {...props} />;
    case "sun": return <Sun {...props} />;
    case "star": return <Star {...props} />;
    case "lists": return <Folder {...props} />;
  }
}

function NavigationItems({ role, workspace = "projects", activeHref, onNavigate }: { role: WorkspaceRole; workspace?: "personal" | "projects"; activeHref?: string; onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void }) {
  return <nav aria-label="Main navigation" className="workspace-navigation">
    {getWorkspaceNavItems(role, workspace).map((item) => <Link key={item.href} href={item.href} aria-current={activeHref === item.href ? "page" : undefined} onClick={(event) => onNavigate?.(event, item.href)} className={`workspace-nav-item ${activeHref === item.href ? "workspace-nav-active" : ""}`}>
      <NavIcon name={item.icon} /><span className="min-w-0 flex-1">{item.label}</span>
    </Link>)}
  </nav>;
}

export function WorkspaceNavigationFallback({ role, workspace }: { role: WorkspaceRole; workspace?: "personal" | "projects" }) {
  return <NavigationItems role={role} workspace={workspace} />;
}

export default function WorkspaceNavigation({ role, workspace }: { role: WorkspaceRole; workspace?: "personal" | "projects" }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, [pathname, search]);

  const activeWorkspace = workspace ?? (pathname === "/todos" ? "personal" : "projects");
  const activeHref = getActiveWorkspaceNavHref(role, activeWorkspace === "personal" ? "/todos" : pathname, search, hash);
  function onNavigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const destination = new URL(href, window.location.origin);
    if (destination.pathname === pathname && destination.search === window.location.search && destination.hash !== window.location.hash) {
      event.preventDefault();
      window.location.hash = destination.hash;
    }
    event.currentTarget.closest<HTMLDetailsElement>("details.workspace-mobile-nav")?.removeAttribute("open");
  }

  return <NavigationItems role={role} workspace={activeWorkspace} activeHref={activeHref} onNavigate={onNavigate} />;
}
