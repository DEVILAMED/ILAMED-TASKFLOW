export class UploadTooLargeError extends Error {
  constructor() {
    super("The upload is too large. Attach up to five images, 5 MB each.");
  }
}

// Enforce the limit while reading; Content-Length may be absent or untrusted.
export async function readLimitedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) throw new UploadTooLargeError();
  if (!request.body) throw new Error("Missing upload body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new UploadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
}
