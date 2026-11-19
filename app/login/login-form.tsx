"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import PasswordInput from "@/app/password-input";

export default function LoginForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        startTransition(() => {
          router.push(data.user?.role === "ADMIN" ? "/admin" : data.user?.role === "MANAGER" ? "/manager" : "/dashboard");
          router.refresh();
        });
        return;
      }

      const data = await response.json().catch(() => ({}));
      setError(data.error || "Login failed. Please try again.");
    } catch {
      setError("Unable to connect. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
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

      <div className="grid gap-2 text-sm font-medium text-white/48">
        <label htmlFor="login-password">Password</label>
        <PasswordInput
          id="login-password"
          name="password"
          placeholder="********"
          required
          minLength={12}
          autoComplete="current-password"
        />
      </div>

      {error ? (
        <p className="feedback-error rounded-2xl border px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      <button
        className="accent-button mt-1 flex h-12 items-center justify-center px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
        type="submit"
        disabled={submitting || isPending}
        aria-busy={submitting || isPending}
      >
        {submitting || isPending ? "Signing in..." : "Sign in"}
      </button>

    </form>
  );
}
