"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TaskLifecycleButton({ taskId, action, returnHref }: { taskId: string; action: "ARCHIVE" | "UNARCHIVE" | "RESTORE"; returnHref?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/company-tasks/${encodeURIComponent(taskId)}/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to update this task.");
      if (returnHref) router.push(returnHref);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update this task."); }
    finally { setPending(false); }
  }
  return <div><button type="button" className="secondary-button rounded-lg px-3 py-2 text-sm disabled:opacity-50" disabled={pending} onClick={() => void save()}>{pending ? "Saving…" : action === "RESTORE" ? "Restore task" : action === "ARCHIVE" ? "Archive task" : "Unarchive task"}</button>{error ? <p role="alert" className="mt-2 text-sm text-rose-500">{error}</p> : null}</div>;
}
