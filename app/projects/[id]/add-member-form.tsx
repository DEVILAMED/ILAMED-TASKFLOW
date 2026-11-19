"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type AddMemberFormProps = {
  projectId: string;
};

export default function AddMemberForm({ projectId }: AddMemberFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Member email is required.");
      return;
    }

    const response = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    if (response.ok) {
      setEmail("");
      setSuccess(`Added ${normalizedEmail} to the project.`);
      startTransition(() => {
        router.refresh();
      });
      return;
    }

    const data = await response.json().catch(() => ({}));
    setError(data.error || "Unable to add member.");
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-2 text-sm font-medium text-white/55">
        Invite by email
        <input
          className="h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-indigo-500/50 focus:bg-white/[0.07]"
          type="email"
          placeholder="teammate@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <button
        className="flex h-10 items-center justify-center rounded-lg bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? "Adding teammate..." : "Add teammate"}
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
