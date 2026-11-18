import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_PROFILE_PHOTO_BODY_BYTES } from "@/lib/profile-photo-policy";
import { readLimitedFormData, UploadTooLargeError } from "@/lib/limited-form-data";
import { InvalidProfilePhotoError, prepareProfilePhoto } from "@/lib/prepare-profile-photo";
import { readStoredAvatar, userAvatarUrl } from "@/lib/user-avatar";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const privateHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

async function authorizeUpdate(id: string) {
  const actor = await getCurrentUser();
  if (!actor) return { response: NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 }) };
  if (actor.id !== id && actor.role !== "ADMIN") {
    return { response: NextResponse.json({ ok: false, error: "You can only change your own profile picture." }, { status: 403 }) };
  }
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target || (actor.id !== id && target.role === "ADMIN")) {
    return { response: NextResponse.json({ ok: false, error: "Account not found or access denied." }, { status: 404 }) };
  }
  return { where: { id, ...(actor.id === id ? {} : { role: { not: "ADMIN" as const } }) } };
}

export async function GET(_request: Request, { params }: Context) {
  if (!await getCurrentUser()) return new Response(null, { status: 401, headers: privateHeaders });
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { avatar: true } });
  const data = readStoredAvatar(user?.avatar);
  if (!data) return new Response(null, { status: 404, headers: privateHeaders });
  return new Response(new Uint8Array(data), { headers: { ...privateHeaders, "Content-Type": "image/webp", "Content-Length": String(data.byteLength), "X-Content-Type-Options": "nosniff" } });
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const authorization = await authorizeUpdate(id);
  if ("response" in authorization) return authorization.response;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "Upload a photo using the file picker." }, { status: 400 });
  }
  let avatar: string;
  try {
    const form = await readLimitedFormData(request, MAX_PROFILE_PHOTO_BODY_BYTES);
    const photos = form.getAll("photo");
    if ([...form.keys()].some(key => key !== "photo") || photos.length !== 1 || !(photos[0] instanceof File)) {
      return NextResponse.json({ ok: false, error: "Choose exactly one profile photo." }, { status: 400 });
    }
    avatar = await prepareProfilePhoto(photos[0]);
  } catch (error) {
    if (error instanceof UploadTooLargeError) return NextResponse.json({ ok: false, error: "Choose a photo of 5 MB or smaller." }, { status: 413 });
    if (error instanceof InvalidProfilePhotoError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: "The photo upload could not be read. Choose the file again." }, { status: 400 });
  }
  const updated = await prisma.user.updateMany({ where: authorization.where, data: { avatar } });
  if (!updated.count) return NextResponse.json({ ok: false, error: "This account changed. Refresh the page and try again." }, { status: 409 });
  return NextResponse.json({ ok: true, avatarUrl: userAvatarUrl(id, avatar) }, { headers: privateHeaders });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const authorization = await authorizeUpdate(id);
  if ("response" in authorization) return authorization.response;
  const updated = await prisma.user.updateMany({ where: authorization.where, data: { avatar: null } });
  if (!updated.count) return NextResponse.json({ ok: false, error: "This account changed. Refresh the page and try again." }, { status: 409 });
  return NextResponse.json({ ok: true, avatarUrl: null }, { headers: privateHeaders });
}
