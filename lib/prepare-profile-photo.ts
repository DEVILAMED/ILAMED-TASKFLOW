import sharp from "sharp";
import { validateProfilePhoto } from "@/lib/profile-photo-policy";
import { AVATAR_DATA_PREFIX } from "@/lib/user-avatar";

export class InvalidProfilePhotoError extends Error {}

export async function prepareProfilePhoto(file: File): Promise<string> {
  const error = validateProfilePhoto(file);
  if (error) throw new InvalidProfilePhotoError(error);
  const input = Buffer.from(await file.arrayBuffer());
  const detectedType = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
    : input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff ? "image/jpeg"
    : input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
  if (!detectedType || detectedType !== file.type) throw new InvalidProfilePhotoError("This file is not a valid JPEG, PNG, or WebP photo.");
  try {
    const data = await sharp(input, { limitInputPixels: 24_000_000, failOn: "warning", animated: false })
      .autoOrient()
      .resize(256, 256, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();
    if (data.byteLength > 128 * 1024) throw new Error("Photo exceeds the storage limit.");
    // Re-encoding removes metadata and stores a bounded thumbnail in User.avatar.
    return `${AVATAR_DATA_PREFIX}${data.toString("base64")}`;
  } catch {
    throw new InvalidProfilePhotoError("This photo could not be read or exceeds 24 megapixels. Choose another image.");
  }
}
