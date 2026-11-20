import { Download, Paperclip } from "lucide-react";
import type { SubmissionAttachment } from "@/lib/submission-attachments";

export default function SubmissionAttachmentList({ attachments = [] }: { attachments?: SubmissionAttachment[] }) {
  if (!attachments.length) return null;
  return <div className="mt-3"><h4 className="mb-2 flex items-center gap-2 text-xs font-semibold"><Paperclip size={14} aria-hidden="true" />Attached files</h4>
    <ul className="space-y-2">{attachments.map(file => <li key={file.id}><a href={file.url} download={file.fileName} className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--stroke)] p-3 text-[var(--accent)] hover:bg-[var(--panel-soft)]">
      <Download size={16} aria-hidden="true" className="shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate text-sm" title={file.fileName}>{file.fileName}</span><span className="block text-xs text-[var(--muted)]">{Math.max(1, Math.ceil(file.size / 1024))} KB</span></span><span className="text-xs">Download</span>
    </a></li>)}</ul>
  </div>;
}
