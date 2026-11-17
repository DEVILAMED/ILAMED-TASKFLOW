export const MAX_SUBMISSION_IMAGES = 5;
export const MAX_SUBMISSION_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_SUBMISSION_BODY_BYTES = MAX_SUBMISSION_IMAGES * MAX_SUBMISSION_IMAGE_BYTES + 64 * 1024;
export const SUBMISSION_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type SubmissionImage = {
  id: string;
  fileName: string;
  width: number;
  height: number;
  size: number;
  url: string;
};

export function validateSubmissionImages(files: readonly { size: number; type: string }[]): string | null {
  if (files.length > MAX_SUBMISSION_IMAGES) return `Attach up to ${MAX_SUBMISSION_IMAGES} images per submission.`;
  for (const file of files) {
    if (!SUBMISSION_IMAGE_TYPES.includes(file.type)) return "Choose JPEG, PNG, or WebP images.";
    if (file.size === 0) return "An image is empty. Choose another file.";
    if (file.size > MAX_SUBMISSION_IMAGE_BYTES) return "Each image must be 5 MB or smaller.";
  }
  return null;
}

export function submissionImageUrl(taskId: string, submissionId: string, imageId: string): string {
  return `/api/company-tasks/${encodeURIComponent(taskId)}/submissions/${encodeURIComponent(submissionId)}/images/${encodeURIComponent(imageId)}`;
}

// Deliberately exclude image bytes from list and review responses.
export const submissionImageSelect = {
  id: true, fileName: true, width: true, height: true, size: true,
} as const;
