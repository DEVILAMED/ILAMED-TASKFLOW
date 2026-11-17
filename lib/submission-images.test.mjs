import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { MAX_SUBMISSION_IMAGE_BYTES, submissionImageUrl, validateSubmissionImages } from "./submission-images.ts";
import { readLimitedFormData, UploadTooLargeError } from "./limited-form-data.ts";
import { InvalidSubmissionImageError, prepareSubmissionImage } from "./prepare-submission-image.ts";

test("images remain optional and permit five files at the per-image size limit", () => {
  assert.equal(validateSubmissionImages([]), null);
  assert.equal(validateSubmissionImages(Array.from({ length: 5 }, () => ({ size: MAX_SUBMISSION_IMAGE_BYTES, type: "image/jpeg" }))), null);
});

test("reject excess files, oversized files, empty files, and unsupported formats", () => {
  assert.match(validateSubmissionImages(Array.from({ length: 6 }, () => ({ size: 1, type: "image/png" }))), /up to 5/);
  assert.match(validateSubmissionImages([{ size: MAX_SUBMISSION_IMAGE_BYTES + 1, type: "image/png" }]), /5 MB/);
  assert.match(validateSubmissionImages([{ size: 0, type: "image/png" }]), /empty/);
  for (const type of ["image/svg+xml", "image/gif", "text/html", "application/octet-stream"]) {
    assert.match(validateSubmissionImages([{ size: 100, type }]), /JPEG, PNG, or WebP/);
  }
});

test("multipart parsing preserves file contents and optional notes", async () => {
  const form = new FormData();
  form.set("status", "SUBMITTED_FOR_REVIEW");
  form.set("notes", "Finished the task.");
  form.append("images", new File([new Uint8Array([0, 1, 255])], "proof.png", { type: "image/png" }));
  const parsed = await readLimitedFormData(new Request("http://localhost", { method: "PATCH", body: form }), 4096);
  assert.equal(parsed.get("notes"), "Finished the task.");
  const image = parsed.get("images");
  assert.equal(image.name, "proof.png");
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), new Uint8Array([0, 1, 255]));
});

test("streaming uploads enforce the cap when Content-Length is missing or understated", async () => {
  for (const contentLength of [undefined, "1"]) {
    let cancelled = false;
    let reads = 0;
    const body = new ReadableStream({
      pull(controller) { reads++; controller.enqueue(new Uint8Array(8)); },
      cancel() { cancelled = true; },
    });
    const request = new Request("http://localhost", { method: "PATCH", duplex: "half", body, headers: contentLength ? { "Content-Length": contentLength } : {} });
    await assert.rejects(readLimitedFormData(request, 10), UploadTooLargeError);
    assert.equal(cancelled, true);
    assert.ok(reads <= 3, "Stop reading instead of buffering the entire body");
  }
});

test("large declared uploads and malformed multipart bodies fail before parsing", async () => {
  await assert.rejects(readLimitedFormData(new Request("http://localhost", { method: "PATCH", body: "bad", headers: { "Content-Length": "100" } }), 10), UploadTooLargeError);
  await assert.rejects(readLimitedFormData(new Request("http://localhost", { method: "PATCH", body: "bad", headers: { "Content-Type": "multipart/form-data; boundary=missing" } }), 100));
});

test("JPEG, PNG, and WebP inputs become valid WebP images without upscaling", async () => {
  for (const [format, type] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]) {
    const input = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#573fea" } }).toFormat(format).toBuffer();
    const image = await prepareSubmissionImage(new File([input], `proof.${format}`, { type }));
    const metadata = await sharp(image.data).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(image.mimeType, "image/webp");
    assert.equal(image.width, 80);
    assert.equal(image.height, 60);
    assert.equal(image.size, image.data.byteLength);
    assert.equal(image.fileName, "proof.webp");
  }
});

test("images are oriented, resized, and stripped of original metadata and path names", async () => {
  const input = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "white" } })
    .jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Artist: "Private employee metadata" } } }).toBuffer();
  const image = await prepareSubmissionImage(new File([input], "C:\\private\\proof\u0000.jpg", { type: "image/jpeg" }));
  const metadata = await sharp(image.data).metadata();
  assert.equal(image.width, 960);
  assert.equal(image.height, 1920);
  assert.equal(image.fileName, "proof.webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
});

test("forged content types, active content, and corrupt image files cannot be stored", async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  for (const file of [
    new File([png], "forged.jpg", { type: "image/jpeg" }),
    new File(["<svg onload='alert(1)'></svg>"], "forged.png", { type: "image/png" }),
    new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "broken.png", { type: "image/png" }),
  ]) await assert.rejects(prepareSubmissionImage(file), InvalidSubmissionImageError);
});

test("highly compressed images above the decoded pixel limit are rejected", async () => {
  const input = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
  assert.ok(input.byteLength < MAX_SUBMISSION_IMAGE_BYTES);
  await assert.rejects(prepareSubmissionImage(new File([input], "huge.png", { type: "image/png" })), InvalidSubmissionImageError);
});

test("private image URLs encode path identifiers", () => {
  assert.equal(submissionImageUrl("task/1", "submission?1", "image#1"), "/api/company-tasks/task%2F1/submissions/submission%3F1/images/image%231");
});
