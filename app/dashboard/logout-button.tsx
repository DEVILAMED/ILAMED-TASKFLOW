"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleLogout = async () => {
    setError(null);
    const response = await fetch("/api/auth/logout", { method: "POST" });

    if (response.ok) {
      startTransition(() => {
        router.push("/");
        router.refresh();
      });
      return;
    }

    setError("Logout failed.");
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        title="Sign out"
        onClick={handleLogout}
        disabled={isPending}
        aria-busy={isPending}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/80 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-800 shadow-sm transition hover:border-indigo-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? "Signing out..." : "Logout"}
      </button>
      {error ? <p className="text-[10px] text-red-400">{error}</p> : null}
    </div>
  );
}
