"use client";

import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("ilamed-theme", next); }
    catch { /* Appearance still changes when browser storage is unavailable. */ }
  }
  return <button type="button" aria-label="Toggle light or dark theme" title="Toggle theme" onClick={toggle} className="workspace-control flex h-10 w-10 items-center justify-center rounded-xl">
    <Sun aria-hidden="true" className="theme-icon-light" size={18} strokeWidth={1.7} /><Moon aria-hidden="true" className="theme-icon-dark" size={18} strokeWidth={1.7} />
  </button>;
}
