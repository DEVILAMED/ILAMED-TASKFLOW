import { attachmentExtension, SUBMISSION_ATTACHMENT_TYPES, validateSubmissionAttachments } from "./submission-attachments.ts";

export class InvalidSubmissionAttachmentError extends Error {}

export async function prepareSubmissionAttachment(file: File) {
  const error = validateSubmissionAttachments([file]);
  if (error) throw new InvalidSubmissionAttachmentError(error);
  const data = Buffer.from(await file.arrayBuffer());
  const extension = attachmentExtension(file.name);
  const zip = data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && ((data[2] === 3 && data[3] === 4) || (data[2] === 5 && data[3] === 6) || (data[2] === 7 && data[3] === 8));
  const ole = data.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  let valid = extension === "pdf" ? data.toString("ascii", 0, 5) === "%PDF-"
    : ["docx", "xlsx", "pptx", "zip"].includes(extension) ? zip
    : ["doc", "xls", "ppt"].includes(extension) ? ole : true;
  if (["txt", "csv"].includes(extension)) {
    try { new TextDecoder("utf-8", { fatal: true }).decode(data); valid = !data.includes(0); } catch { valid = false; }
  }
  if (!valid) throw new InvalidSubmissionAttachmentError("An attachment does not contain a valid file of the selected type. Choose another file.");
  const baseName = file.name.split(/[\\/]/).pop() || `attachment.${extension}`;
  const stem = baseName.slice(0, -(extension.length + 1)).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 140) || "attachment";
  return { fileName: `${stem}.${extension}`, mimeType: SUBMISSION_ATTACHMENT_TYPES[extension], data: new Uint8Array(data), size: data.byteLength };
}
