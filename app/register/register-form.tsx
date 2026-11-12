"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function RegisterForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        startTransition(() => {
          router.push(data.user?.role === "ADMIN" ? "/admin" : data.user?.role === "MANAGER" ? "/manager" : "/company-tasks");
          router.refresh();
        });
        return;
      }

      const data = await response.json().catch(() => ({}));
      setError(data.error || "Registration failed. Please try again.");
    } catch {
      setError("Unable to connect. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-medium text-white/48">
        Name
        <input
          className="soft-input h-12 rounded-2xl px-4 text-sm"
          name="name"
          type="text"
          placeholder="Avery Lane"
          autoComplete="name"
          minLength={2}
          required
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-white/48">
        Email
        <input
          className="soft-input h-12 rounded-2xl px-4 text-sm"
          name="email"
          type="email"
          placeholder="you@company.com"
          required
          autoComplete="email"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-white/48">
        Password
        <input
          className="soft-input h-12 rounded-2xl px-4 text-sm"
          name="password"
          type="password"
          placeholder="12+ characters, strong password"
          required
          minLength={12}
          autoComplete="new-password"
        />
      </label>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xs leading-6 text-white/34">
        Once your account is ready, an administrator can assign tasks to you.
      </div>

      {error ? (
        <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <button
        className="accent-button mt-1 flex h-12 items-center justify-center px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
        type="submit"
        disabled={submitting || isPending}
        aria-busy={submitting || isPending}
      >
        {submitting || isPending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}