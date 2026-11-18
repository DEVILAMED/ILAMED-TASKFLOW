export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PROFILE_PHOTO_BODY_BYTES = MAX_PROFILE_PHOTO_BYTES + 64 * 1024;
export const PROFILE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateProfilePhoto(file: { size: number; type: string }): string | null {
  if (!PROFILE_PHOTO_TYPES.includes(file.type)) return "Choose a JPEG, PNG, or WebP photo.";
  if (file.size === 0) return "This photo is empty. Choose another file.";
  if (file.size > MAX_PROFILE_PHOTO_BYTES) return "Choose a photo of 5 MB or smaller.";
  return null;
}
