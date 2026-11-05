"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  useEffect(() => {
    const saved = localStorage.getItem("ilamed-theme");
    const next = saved === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
  }, []);
  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("ilamed-theme", next);
  }
  return <button type="button" aria-label="Toggle light or dark theme" title="Toggle theme" onClick={toggle} className="workspace-control flex h-10 w-10 items-center justify-center rounded-xl">
    <Sun aria-hidden="true" className="theme-icon-light" size={18} strokeWidth={1.7} /><Moon aria-hidden="true" className="theme-icon-dark" size={18} strokeWidth={1.7} />
  </button>;
}
