import { createHash } from "node:crypto";

export const AVATAR_DATA_PREFIX = "data:image/webp;base64,";
export const USER_IDENTITY_SELECT = { id: true, name: true, email: true, avatar: true } as const;

// Only normalized images are served. Image bytes never go into identity responses.
export function userAvatarUrl(userId: string, avatar: string | null | undefined): string | null {
  if (!avatar?.startsWith(AVATAR_DATA_PREFIX)) return null;
  const version = createHash("sha256").update(avatar).digest("hex").slice(0, 16);
  return `/api/users/${encodeURIComponent(userId)}/avatar?v=${version}`;
}

export function withAvatarUrl<T extends { id: string; avatar?: string | null }>(user: T) {
  const { avatar, ...identity } = user;
  return { ...identity, avatarUrl: userAvatarUrl(user.id, avatar) };
}

export function readStoredAvatar(avatar: string | null | undefined): Buffer | null {
  if (!avatar || avatar.length > 180_000 || !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)) return null;
  const data = Buffer.from(avatar.slice(AVATAR_DATA_PREFIX.length), "base64");
  return data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP" ? data : null;
}
