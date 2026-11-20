"use client";

import { useId, useRef, useState } from "react";
import { MAX_SUBMISSION_ATTACHMENTS, SUBMISSION_ATTACHMENT_ACCEPT, validateSubmissionAttachments } from "@/lib/submission-attachments";

export default function SubmissionFilePicker({ disabled, onChange }: { disabled: boolean; onChange: (files: File[]) => void }) {
  const id = useId();
  const selectedRef = useRef<File[]>([]);
  const [selected, setSelected] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  function update(files: File[]) { selectedRef.current = files; setSelected(files); onChange(files); }
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-xs font-medium">Attach files (optional)</label>
    <input id={id} type="file" multiple accept={SUBMISSION_ATTACHMENT_ACCEPT} disabled={disabled || selected.length >= MAX_SUBMISSION_ATTACHMENTS}
      aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
      className="block w-full min-w-0 rounded-lg border border-[var(--stroke)] p-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[var(--panel-soft)] file:px-3 file:py-2 file:text-[var(--foreground)] disabled:opacity-50"
      onChange={event => {
        const added = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        if (!added.length) return;
        const next = [...selectedRef.current, ...added];
        const validation = validateSubmissionAttachments(next);
        setError(validation);
        if (!validation) update(next);
      }} />
    <p id={`${id}-hint`} className="text-xs text-[var(--muted)]">Up to 5 PDF, Word, Excel, PowerPoint, TXT, CSV, or ZIP files, 10 MB each.</p>
    {error ? <p id={`${id}-error`} role="alert" className="text-xs text-rose-500">{error}</p> : null}
    {selected.length ? <ul className="space-y-2">{selected.map((file, index) => <li key={`${index}-${file.name}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-[var(--stroke)] p-2">
      <div className="min-w-0"><p className="truncate text-xs" title={file.name}>{file.name}</p><p className="text-xs text-[var(--muted)]">{Math.max(1, Math.ceil(file.size / 1024))} KB</p></div>
      <button type="button" disabled={disabled} aria-label={`Remove ${file.name}`} className="text-xs text-[var(--accent)] underline disabled:opacity-50" onClick={() => { update(selectedRef.current.filter((_, position) => position !== index)); setError(null); }}>Remove</button>
    </li>)}</ul> : null}
  </div>;
}
