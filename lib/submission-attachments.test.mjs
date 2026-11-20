import assert from "node:assert/strict";
import test from "node:test";
import { attachmentContentDisposition, MAX_SUBMISSION_ATTACHMENT_BYTES, submissionAttachmentUrl, validateSubmissionAttachments } from "./submission-attachments.ts";
import { InvalidSubmissionAttachmentError, prepareSubmissionAttachment } from "./prepare-submission-attachment.ts";

const file = (name = "report.pdf", type = "application/pdf", size = 10) => ({ name, type, size });

test("attachments remain optional and accept five supported files at the size limit", () => {
  assert.equal(validateSubmissionAttachments([]), null);
  assert.equal(validateSubmissionAttachments(Array.from({ length: 5 }, () => file("report.pdf", "application/pdf", MAX_SUBMISSION_ATTACHMENT_BYTES))), null);
  for (const [name, type] of [["file.PDF", "application/pdf"], ["file.docx", ""], ["file.xlsx", "application/octet-stream"], ["file.csv", "application/vnd.ms-excel"], ["file.zip", "application/x-zip-compressed"]]) {
    assert.equal(validateSubmissionAttachments([file(name, type)]), null);
  }
});

test("attachments reject excess files, unsupported formats, mismatched MIME, empty and oversized files", () => {
  assert.match(validateSubmissionAttachments(Array.from({ length: 6 }, () => file())), /up to 5/);
  assert.match(validateSubmissionAttachments([file("report.pdf", "application/pdf", MAX_SUBMISSION_ATTACHMENT_BYTES + 1)]), /10 MB/);
  assert.match(validateSubmissionAttachments([file("report.pdf", "application/pdf", 0)]), /empty/);
  for (const name of ["script.exe", "page.html", "image.svg", "report.pdf.exe", "file.__proto__", "file.constructor", "pdf"]) assert.ok(validateSubmissionAttachments([file(name, "")]));
  assert.match(validateSubmissionAttachments([file("report.pdf", "text/html")]), /does not match/);
});

test("document preparation retains contents and sanitizes file names", async () => {
  const source = new File(["%PDF-1.4\nexample"], "folder/report\r\n.pdf", { type: "application/pdf" });
  const saved = await prepareSubmissionAttachment(source);
  assert.equal(saved.fileName, "report.pdf");
  assert.equal(saved.mimeType, "application/pdf");
  assert.equal(saved.size, source.size);
  assert.equal(Buffer.from(saved.data).toString(), "%PDF-1.4\nexample");
  const text = await prepareSubmissionAttachment(new File(["Report text"], "report.txt", { type: "text/plain" }));
  assert.equal(text.mimeType, "text/plain");
});

test("document preparation rejects forged headers, binary text, invalid UTF-8 and mismatched MIME", async () => {
  for (const file of [
    new File(["fake"], "report.pdf", { type: "application/pdf" }),
    new File(["fake"], "report.docx"),
    new File(["fake"], "report.xls"),
    new File([new Uint8Array([65, 0, 66])], "report.csv"),
    new File([new Uint8Array([255, 255])], "report.txt"),
    new File(["%PDF-1.4"], "report.pdf", { type: "text/html" }),
  ]) await assert.rejects(prepareSubmissionAttachment(file), InvalidSubmissionAttachmentError);
});

test("document preparation recognizes Office and ZIP signatures", async () => {
  for (const extension of ["docx", "xlsx", "pptx", "zip"]) {
    const prepared = await prepareSubmissionAttachment(new File([new Uint8Array([0x50, 0x4b, 3, 4, 0])], `report.${extension}`));
    assert.equal(prepared.fileName, `report.${extension}`);
  }
  for (const extension of ["doc", "xls", "ppt"]) {
    const prepared = await prepareSubmissionAttachment(new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])], `report.${extension}`));
    assert.equal(prepared.fileName, `report.${extension}`);
  }
});

test("attachment links encode identifiers and downloads use attachment disposition without header injection", () => {
  assert.equal(submissionAttachmentUrl("task/1", "submission?1", "file#1"), "/api/company-tasks/task%2F1/submissions/submission%3F1/attachments/file%231");
  const disposition = attachmentContentDisposition('report "one"\r\n.pdf');
  assert.ok(disposition.startsWith("attachment;"));
  assert.ok(!/[\r\n]/.test(disposition));
  assert.ok(disposition.includes("filename*=UTF-8''"));
});
