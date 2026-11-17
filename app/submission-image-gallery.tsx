import Image from "next/image";
import type { SubmissionImage } from "@/lib/submission-images";

export default function SubmissionImageGallery({ images }: { images: SubmissionImage[] }) {
  if (!images.length) return null;
  return <div className="mt-3">
    <p className="mb-2 text-xs font-medium text-[var(--muted)]">Completion images ({images.length})</p>
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {images.map((image) => <li key={image.id} className="min-w-0">
        <a href={image.url} target="_blank" rel="noreferrer" aria-label={`Open ${image.fileName} in a new tab`} className="block overflow-hidden rounded-lg border border-[var(--stroke)] bg-[var(--panel-soft)] p-2 hover:border-[var(--accent)]">
          {/* Private images need the browser's session cookie; bypass the image optimizer. */}
          <Image unoptimized src={image.url} alt={image.fileName} width={image.width} height={image.height} className="h-32 w-full rounded object-contain" />
          <span title={image.fileName} className="mt-1 block truncate text-xs text-[var(--muted)]">{image.fileName}</span>
        </a>
      </li>)}
    </ul>
  </div>;
}
