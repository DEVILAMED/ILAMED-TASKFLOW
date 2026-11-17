"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { MAX_SUBMISSION_IMAGES, SUBMISSION_IMAGE_TYPES, validateSubmissionImages } from "@/lib/submission-images";

type SelectedImage = { file: File; preview: string };

export default function SubmissionImagePicker({ disabled, onChange }: { disabled: boolean; onChange: (files: File[]) => void }) {
  const inputId = useId();
  const selectedRef = useRef<SelectedImage[]>([]);
  const [selected, setSelected] = useState<SelectedImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    for (const image of selectedRef.current) URL.revokeObjectURL(image.preview);
  }, []);

  function update(next: SelectedImage[]) {
    selectedRef.current = next;
    setSelected(next);
    onChange(next.map((image) => image.file));
  }

  return <div className="space-y-2">
    <label htmlFor={inputId} className="block text-xs font-medium">Completion images (optional)</label>
    <input
      id={inputId} type="file" multiple accept={SUBMISSION_IMAGE_TYPES.join(",")}
      disabled={disabled || selected.length >= MAX_SUBMISSION_IMAGES}
      aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ""}`}
      className="block w-full min-w-0 rounded-lg border border-[var(--stroke)] p-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[var(--panel-soft)] file:px-3 file:py-2 file:text-[var(--foreground)] disabled:opacity-50"
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        if (!files.length) return;
        const validation = validateSubmissionImages([...selectedRef.current.map((image) => image.file), ...files]);
        setError(validation);
        if (validation) return;
        update([...selectedRef.current, ...files.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
      }}
    />
    <p id={`${inputId}-hint`} className="text-xs text-[var(--muted)]">Up to 5 JPEG, PNG, or WebP images, 5 MB each.</p>
    {error ? <p id={`${inputId}-error`} role="alert" className="text-xs text-rose-500">{error}</p> : null}
    {selected.length ? <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {selected.map((image, index) => <li key={image.preview} className="min-w-0 rounded-lg border border-[var(--stroke)] p-2">
        <Image unoptimized src={image.preview} alt={`Preview of ${image.file.name}`} width={160} height={120} className="h-24 w-full rounded-md object-contain" />
        <p title={image.file.name} className="mt-1 truncate text-xs text-[var(--muted)]">{image.file.name}</p>
        <button type="button" disabled={disabled} aria-label={`Remove ${image.file.name}`} className="mt-1 text-xs text-[var(--accent)] underline disabled:opacity-50" onClick={() => {
          URL.revokeObjectURL(image.preview);
          update(selectedRef.current.filter((_, position) => position !== index));
          setError(null);
        }}>Remove</button>
      </li>)}
    </ul> : null}
  </div>;
}
