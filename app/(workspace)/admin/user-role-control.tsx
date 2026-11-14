"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type UserRoleControlProps = {
  userId: string;
  role: "ADMIN" | "MANAGER" | "USER";
  isBlocked?: boolean;
  displayName?: string;
  isCurrentUser: boolean;
};

export default function UserRoleControl({
  userId,
  role,
  isBlocked = false,
  displayName = userId,
  isCurrentUser,
}: UserRoleControlProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function updateRole(nextRole: "ADMIN" | "MANAGER" | "USER") {
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Unable to update user role.");
        return;
      }

      startTransition(() => router.refresh());
    } catch {
      setError("Unable to reach the server. Please try again.");
    }
  }

  async function setBlocked(nextIsBlocked: boolean) {
    const action = nextIsBlocked ? "block" : "restore access to";
    if (!window.confirm(`${nextIsBlocked ? "Block" : "Restore access to"} ${displayName}? ${nextIsBlocked ? "They will be signed out and won't be able to log in until access is restored." : "They will be able to log in again."}`)) {
      return;
    }

    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBlocked: nextIsBlocked }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || `Unable to ${action} this account.`);
        return;
      }

      startTransition(() => router.refresh());
    } catch {
      setError("Unable to reach the server. Please try again.");
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm(
      `Permanently delete ${displayName}'s account? This cannot be undone. Their assigned company tasks will be unassigned, authored comments and activity will be removed, and their personal task lists and tasks will be deleted. Projects and teams they own will be transferred to you.`,
    );
    if (!confirmed) return;

    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Unable to delete this account.");
        return;
      }

      startTransition(() => router.refresh());
    } catch {
      setError("Unable to reach the server. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {isCurrentUser ? (
        <span className="badge-pill text-xs text-[var(--accent)]">You · Admin</span>
      ) : (
        <label className="flex items-center gap-3 text-xs text-white/45">
          Role
          <select
            aria-label={`Role for ${userId}`}
            aria-busy={isPending}
            className="soft-input h-10 rounded-xl px-3 text-sm"
            value={role}
            disabled={isPending}
            onChange={(event) => updateRole(event.target.value as "ADMIN" | "MANAGER" | "USER")}
          >
            <option value="USER">User</option>
            <option value="MANAGER" disabled>Manager · appointed to a team</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
      )}
      {!isCurrentUser ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/65 transition hover:border-white/20 hover:text-white disabled:opacity-50"
            disabled={isPending}
            onClick={() => void setBlocked(!isBlocked)}
          >
            {isBlocked ? "Restore access" : "Block login"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-rose-400/20 px-3 py-2 text-xs text-rose-200/80 transition hover:border-rose-400/40 hover:text-rose-100 disabled:opacity-50"
            disabled={isPending}
            onClick={() => void deleteAccount()}
          >
            Delete account
          </button>
        </div>
      ) : null}
      {!isCurrentUser && isBlocked ? <p className="text-xs text-amber-200/75">Login blocked</p> : null}
      {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
