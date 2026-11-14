"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

type SearchResult = { id: string; title: string; detail: string; kind: string; href: string };

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setResults([]); setBusy(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true); setError(null);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { ok?: boolean; results?: SearchResult[]; error?: string };
        if (!response.ok || !data.ok) throw new Error(data.error || "Search is unavailable.");
        setResults(data.results ?? []); setOpen(true);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Search is unavailable.");
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  useEffect(() => {
    function close(event: PointerEvent) { if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape" && container.current?.contains(document.activeElement)) { setOpen(false); input.current?.focus(); } }
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const accountMenu = container.current?.closest("details");
        if (accountMenu) accountMenu.open = true;
        input.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape); document.addEventListener("keydown", shortcut);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); document.removeEventListener("keydown", shortcut); };
  }, []);

  return <div ref={container} onKeyDown={(event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = Array.from(container.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    if (!links.length) return;
    event.preventDefault();
    const current = links.findIndex((link) => link === document.activeElement);
    links[(current + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length].focus();
  }} className="relative block w-10 shrink-0 focus-within:w-[min(15rem,45vw)] md:w-full md:max-w-[440px] md:shrink">
    <label className="workspace-search flex h-10 items-center gap-0 rounded-xl border px-2.5 focus-within:gap-2 md:gap-2 md:px-3">
      <Search aria-hidden="true" className="shrink-0" size={17} strokeWidth={1.8} />
      <input ref={input} value={query} onFocus={() => setOpen(true)} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." aria-label="Search tasks, projects, and employees" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--subtle)]" />
      {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" /> : <kbd className="hidden rounded border px-1.5 py-0.5 text-[10px] text-[var(--subtle)] lg:inline">⌘ K</kbd>}
    </label>
    {open && query.trim().length >= 2 ? <div className="workspace-search-popover absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border py-1 shadow-xl">
      {error ? <p className="px-4 py-3 text-sm text-rose-500">{error}</p> : results.length ? results.map((result) => <Link key={result.id} href={result.href} onClick={() => { setOpen(false); setQuery(""); }} className="workspace-search-result flex items-center gap-3 px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[11px] font-semibold text-indigo-700">{result.kind.slice(0, 1)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{result.title}</span><span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{result.kind} · {result.detail}</span></span>
      </Link>) : !busy ? <p className="px-4 py-3 text-sm text-[var(--muted)]">No matching tasks, projects, or people.</p> : null}
    </div> : null}
  </div>;
}
