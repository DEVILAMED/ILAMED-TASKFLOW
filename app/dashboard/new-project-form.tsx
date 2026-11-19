"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const STARTER_NOTES = [
  "Product launch",
  "Client delivery",
  "Ops cleanup",
];

export default function NewProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClick);
    }

    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();

    if (title.length < 2) {
      setError("Project name must be at least 2 characters.");
      return;
    }

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });

    if (response.ok) {
      form.reset();
      setOpen(false);
      startTransition(() => {
        router.refresh();
      });
      return;
    }

    const data = await response.json().catch(() => ({}));
    setError(data.error || "Unable to create project.");
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="accent-button flex h-10 items-center gap-2 px-4 text-xs font-semibold uppercase tracking-[0.18em]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        New project
      </button>

      {open ? (
        <div className="panel-card project-popover absolute right-0 top-12 z-50 w-[360px] rounded-[28px] p-5 shadow-[0_28px_100px_rgba(3,11,16,0.45)]">
          <div className="surface-grid absolute inset-0 opacity-[0.08]" />
          <div className="relative border-b border-white/[0.08] pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/30">
                  New workspace
                </p>
                <p className="mt-2 text-sm leading-6 text-white/44">
                  Create a fresh home for tasks, sprint planning, and team activity.
                </p>
              </div>
              <span className="badge-pill text-[10px] font-semibold text-white/58">Fast setup</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/46">
              {STARTER_NOTES.map((item) => (
                <span key={item} className="badge-pill px-3 py-1.5">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <form className="relative mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/38">
              Project name
              <input
                className="soft-input h-11 rounded-2xl px-4 text-sm normal-case tracking-normal"
                name="title"
                type="text"
                placeholder="Launch marketing site"
                required
                autoFocus
              />
            </label>

            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/38">
              Description
              <textarea
                className="soft-input min-h-[92px] resize-none rounded-[22px] px-4 py-3 text-sm normal-case tracking-normal"
                name="description"
                placeholder="What does this space need to coordinate?"
                rows={4}
              />
            </label>

            {error ? (
              <p className="feedback-error rounded-2xl border px-4 py-3 text-sm">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="secondary-button flex h-10 items-center px-4 text-xs font-semibold uppercase tracking-[0.16em]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                aria-busy={isPending}
                className="accent-button flex h-10 items-center px-5 text-xs font-semibold uppercase tracking-[0.16em] disabled:opacity-50"
              >
                {isPending ? "Creating..." : "Create workspace"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}