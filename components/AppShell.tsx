import Link from "next/link";
import type { ReactNode } from "react";

export type ShellNavItem = {
  href: string;
  label: string;
  badge?: string;
  active?: boolean;
  icon:
    | "dashboard"
    | "folder"
    | "activity"
    | "team"
    | "reports"
    | "home"
    | "board";
};

type AppShellProps = {
  title: string;
  navItems: ShellNavItem[];
  userName: string;
  userEmail: string;
  userAction?: ReactNode;
  topbarRight?: ReactNode;
  children: ReactNode;
};

function ShellIcon({ icon }: { icon: ShellNavItem["icon"] }) {
  switch (icon) {
    case "folder":
      return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M1.5 4.5C1.5 3.67 2.17 3 3 3h3l1.5 1.5H12c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5v-6Z" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "activity":
      return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <polyline points="1,9 4,4.5 7,9.5 10,5 14,8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case "team":
      return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M1 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="11" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M13 12c0-1.5-1-2.5-2-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "reports":
      return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <rect x="1.5" y="1.5" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4.5 9.5V11M7.5 7v4M10.5 4.5v6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "home":
      return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M2.2 6.4 7.5 2.4l5.3 4v5.1c0 .66-.54 1.2-1.2 1.2H3.4c-.66 0-1.2-.54-1.2-1.2V6.4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M5.7 12.7V8.8h3.6v3.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "board":
      return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <rect x="1.8" y="2" width="3.2" height="10.8" rx="0.9" stroke="currentColor" strokeWidth="1.2" />
          <rect x="5.9" y="2" width="3.2" height="7.6" rx="0.9" stroke="currentColor" strokeWidth="1.2" />
          <rect x="10" y="2" width="3.2" height="9.2" rx="0.9" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "dashboard":
    default:
      return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <rect x="1" y="1" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
          <rect x="8.5" y="1" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
          <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
          <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
  }
}

export function AppShell({
  title,
  navItems,
  userName,
  userEmail,
  userAction,
  topbarRight,
  children,
}: AppShellProps) {
  const initials = (userName || userEmail || "U").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-[#0f1117] text-white lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-white/[0.07] bg-[#13161f] lg:w-[220px] lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center gap-2.5 border-b border-white/[0.07] px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1.5" fill="white" />
              <rect x="8" y="1" width="5" height="5" rx="1.5" fill="white" opacity="0.6" />
              <rect x="1" y="8" width="5" height="5" rx="1.5" fill="white" opacity="0.6" />
              <rect x="8" y="8" width="5" height="5" rx="1.5" fill="white" opacity="0.3" />
            </svg>
          </div>
          <Link href="/" className="text-sm font-semibold text-white">
            ILAMED
          </Link>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-2 py-3 lg:flex-1 lg:flex-col lg:overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                item.active
                  ? "bg-white/[0.07] text-white"
                  : "text-white/40 hover:bg-white/[0.04] hover:text-white/70"
              }`}
            >
              <span className="flex-shrink-0">
                <ShellIcon icon={item.icon} />
              </span>
              <span className="flex-1 font-medium">{item.label}</span>
              {item.badge ? (
                <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/[0.07] px-3 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-semibold text-indigo-300">
              {initials}\0/\
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white/70">
                {userName}
              </p>
              <p className="truncate text-[10px] text-white/30">{userEmail}</p>
            </div>
            {userAction}
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#13161f] px-4 sm:px-6">
          <h1 className="text-sm font-semibold text-white/80">{title}</h1>
          <div className="flex items-center gap-2">{topbarRight}</div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
