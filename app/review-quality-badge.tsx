import { MIN_REVIEWED_TASKS, reviewQualityLabel } from "@/lib/review-quality";

export default function ReviewQualityBadge({ score, ratedTaskCount }: { score: number | null; ratedTaskCount: number }) {
  return <span className={`workspace-score-badge ${score !== null && score >= 60 ? "is-good" : ""}`} title={`${ratedTaskCount} distinct reviewed tasks. At least ${MIN_REVIEWED_TASKS} per employee are needed for a score. Latest rated review per task and submitter; score out of 100.`}>
    {score === null ? reviewQualityLabel(score, ratedTaskCount) : `${score} · ${reviewQualityLabel(score, ratedTaskCount)}`}
  </span>;
}
