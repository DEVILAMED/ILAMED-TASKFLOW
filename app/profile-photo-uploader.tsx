"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import UserAvatar from "@/app/user-avatar";
import { PROFILE_PHOTO_TYPES, validateProfilePhoto } from "@/lib/profile-photo-policy";

export default function ProfilePhotoUploader({ userId, name, avatarUrl }: { userId: string; name: string; avatarUrl: string | null }) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState(avatarUrl);
  const [previousAvatarUrl, setPreviousAvatarUrl] = useState(avatarUrl);
  if (previousAvatarUrl !== avatarUrl) { setPreviousAvatarUrl(avatarUrl); setSavedUrl(avatarUrl); }
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function clearSelection() {
    setFile(null); setPreview(null);
    if (input.current) input.current.value = "";
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    setError(null); setNotice(null);
    if (!chosen) return;
    const validation = validateProfilePhoto(chosen);
    if (validation) { clearSelection(); setError(validation); return; }
    setFile(chosen); setPreview(URL.createObjectURL(chosen));
  }

  async function save(remove = false) {
    if (!remove && !file) return;
    setPending(true); setError(null); setNotice(null);
    try {
      const body = new FormData();
      if (!remove && file) body.set("photo", file);
      const response = await fetch(`/api/users/${encodeURIComponent(userId)}/avatar`, { method: remove ? "DELETE" : "POST", ...(remove ? {} : { body }) });
      const result = await response.json() as { ok?: boolean; avatarUrl?: string | null; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to update the profile picture.");
      setSavedUrl(result.avatarUrl ?? null); clearSelection();
      setNotice(remove ? "Profile picture removed." : "Profile picture updated.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update the profile picture."); }
    finally { setPending(false); }
  }

  return <div className="profile-photo-editor" aria-busy={pending}>
    <UserAvatar name={name} src={preview ?? savedUrl} size={96} />
    <div className="profile-photo-controls">
      <label htmlFor={inputId} className="profile-photo-label">Profile picture for {name}</label>
      <p id={`${inputId}-help`} className="profile-photo-help">JPEG, PNG, or WebP, up to 5 MB. Photos use a centered square crop.</p>
      <input ref={input} id={inputId} type="file" accept={PROFILE_PHOTO_TYPES.join(",")} onChange={choosePhoto} disabled={pending} aria-describedby={`${inputId}-help`} className="profile-photo-input" />
      <div className="profile-photo-actions">
        {file ? <><button type="button" onClick={() => void save()} disabled={pending} className="accent-button workspace-standard-button">{pending ? "Saving…" : "Save picture"}</button><button type="button" onClick={clearSelection} disabled={pending} className="secondary-button workspace-standard-button">Cancel</button></> : null}
        {savedUrl && !file ? <button type="button" onClick={() => void save(true)} disabled={pending} className="secondary-button workspace-standard-button">{pending ? "Removing…" : "Remove picture"}</button> : null}
      </div>
      {error ? <p role="alert" className="workspace-form-error">{error}</p> : null}
      {notice ? <p role="status" className="profile-photo-help">{notice}</p> : null}
    </div>
  </div>;
}
