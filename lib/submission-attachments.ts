import { MAX_SUBMISSION_BODY_BYTES } from "./submission-images.ts";

export const MAX_SUBMISSION_ATTACHMENTS = 5;
export const MAX_SUBMISSION_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_SUBMISSION_UPLOAD_BYTES = MAX_SUBMISSION_BODY_BYTES + MAX_SUBMISSION_ATTACHMENTS * MAX_SUBMISSION_ATTACHMENT_BYTES;
export const SUBMISSION_ATTACHMENT_TYPES: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", csv: "text/csv", zip: "application/zip",
};
export const SUBMISSION_ATTACHMENT_ACCEPT = Object.keys(SUBMISSION_ATTACHMENT_TYPES).map(extension => `.${extension}`).join(",");
export type SubmissionAttachment = { id: string; fileName: string; mimeType: string; size: number; url: string };
export const submissionAttachmentSelect = { id: true, fileName: true, mimeType: true, size: true } as const;

export function attachmentExtension(name: string): string { return name.split(".").pop()?.toLowerCase() ?? ""; }
export function validateSubmissionAttachments(files: readonly { name: string; size: number; type: string }[]): string | null {
  if (files.length > MAX_SUBMISSION_ATTACHMENTS) return `Attach up to ${MAX_SUBMISSION_ATTACHMENTS} files per submission.`;
  for (const file of files) {
    const extension = attachmentExtension(file.name);
    const expected = Object.hasOwn(SUBMISSION_ATTACHMENT_TYPES, extension) ? SUBMISSION_ATTACHMENT_TYPES[extension] : null;
    if (!expected || !file.name.includes(".")) return "Choose PDF, Word, Excel, PowerPoint, TXT, CSV, or ZIP files.";
    const mime = file.type.toLowerCase();
    const aliases = extension === "zip" ? ["application/x-zip-compressed"] : extension === "csv" ? ["application/vnd.ms-excel", "text/plain"] : [];
    if (mime && mime !== "application/octet-stream" && mime !== expected && !aliases.includes(mime)) return "A file type does not match its extension. Choose another file.";
    if (file.size === 0) return "An attachment is empty. Choose another file.";
    if (file.size > MAX_SUBMISSION_ATTACHMENT_BYTES) return "Each attached file must be 10 MB or smaller.";
  }
  return null;
}
export function submissionAttachmentUrl(taskId: string, submissionId: string, attachmentId: string) {
  return `/api/company-tasks/${encodeURIComponent(taskId)}/submissions/${encodeURIComponent(submissionId)}/attachments/${encodeURIComponent(attachmentId)}`;
}
export function attachmentContentDisposition(name: string) {
  const ascii = name.replace(/[^a-zA-Z0-9._ -]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
