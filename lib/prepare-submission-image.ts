import sharp from "sharp";

export class InvalidSubmissionImageError extends Error {}

export async function prepareSubmissionImage(file: File) {
  const input = Buffer.from(await file.arrayBuffer());
  const detectedType = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
    : input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff ? "image/jpeg"
    : input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
  if (!detectedType || detectedType !== file.type) {
    throw new InvalidSubmissionImageError("A file is not a valid JPEG, PNG, or WebP image.");
  }

  try {
    const { data, info } = await sharp(input, { limitInputPixels: 24_000_000, failOn: "warning" })
      .autoOrient()
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    // Re-encoding strips embedded metadata and prevents serving untrusted input bytes.
    const baseName = file.name.split(/[\\/]/).pop() || "completion-image";
    const stem = baseName.replace(/\.[^.]*$/, "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) || "completion-image";
    return {
      fileName: `${stem}.webp`, mimeType: "image/webp", data: new Uint8Array(data),
      size: data.byteLength, width: info.width, height: info.height,
    };
  } catch {
    throw new InvalidSubmissionImageError("An image could not be read or exceeds 24 megapixels. Choose another image.");
  }
}
