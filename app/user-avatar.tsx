"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";

export default function UserAvatar({ name, src, size = 32, className = "" }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const initials = (name.trim() || "User").split(/\s+/).map(part => Array.from(part)[0]).slice(0, 2).join("").toLocaleUpperCase();
  return <span className={`user-avatar ${className}`} style={{ "--avatar-size": `${size}px` } as CSSProperties} aria-hidden="true">
    <span>{initials}</span>
    {src && src !== failedSource ? <Image src={src} alt="" width={size} height={size} unoptimized className="user-avatar-image" onError={() => setFailedSource(src)} /> : null}
  </span>;
}
