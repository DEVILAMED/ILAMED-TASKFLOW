"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type AddSprintFormProps = {
  projectId: string;
};

export default function AddSprintForm({ projectId }: AddSprintFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const goal = String(formData.get("goal") || "").trim();
    const startDate = String(formData.get("startDate") || "").trim();
    const endDate = String(formData.get("endDate") || "").trim();
    const isActive = formData.get("isActive") === "on";

    if (title.length < 2) {
      setError("Sprint name must be at least 2 characters.");
      return;
    }

    const response = await fetch(`/api/projects/${projectId}/sprints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        goal,
        startDate: startDate || null,
        endDate: endDate || null,
        isActive,
      }),
    });

    if (response.ok) {
      form.reset();
      setSuccess(`Created sprint \"${title}\".`);
      startTransition(() => {
        router.refresh();
      });
      return;
    }

    const data = await response.json().catch(() => ({}));
    setError(data.error || "Unable to create sprint.");
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-2 text-sm font-medium text-white/55">
        Sprint name
        <input
          className="h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-indigo-500/50 focus:bg-white/[0.07]"
          name="title"
          placeholder="Sprint 12 / Checkout polish"
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium text-white/55">
        Goal
        <textarea
          className="min-h-[88px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-indigo-500/50 focus:bg-white/[0.07]"
          name="goal"
          placeholder="Optional sprint goal"
          rows={3}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium text-white/55">
          Start date
          <input
            className="h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-indigo-500/50 focus:bg-white/[0.07]"
            name="startDate"
            type="date"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-white/55">
          End date
          <input
            className="h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-indigo-500/50 focus:bg-white/[0.07]"
            name="endDate"
            type="date"
          />
        </label>
      </div>
      <label className="flex items-center gap-3 text-sm text-white/50">
        <input
          className="h-4 w-4 rounded border-white/20 bg-white/5"
          name="isActive"
          type="checkbox"
        />
        Make this the active sprint
      </label>
      <button
        className="flex h-10 items-center justify-center rounded-lg bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        style={{ color: "#ffffff" }}
      >
        {isPending ? "Creating sprint..." : "Create sprint"}
      </button>
      {error ? (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="feedback-success rounded-lg border px-3 py-2 text-sm">
          {success}
        </p>
      ) : null}
    </form>
  );
}