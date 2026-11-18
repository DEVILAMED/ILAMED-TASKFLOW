import { employeeDayKey, employeeLeaveDays, isCompanyWorkday, type LeaveDaysByEmployee } from "./company-workdays.ts";

// Product defaults, shared by every score surface. These are not an HR standard.
export const MIN_REVIEWED_TASKS = 5;
export const REVIEW_PERIODS = [
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "365", label: "Last 365 days", days: 365 },
] as const;

export const REVIEW_RUBRIC = [
  { rating: 1, label: "Does not meet requirements", description: "Major requirements are missing or incorrect; substantial rework is needed." },
  { rating: 2, label: "Partially meets requirements", description: "Some requirements are met, but significant corrections are needed." },
  { rating: 3, label: "Meets requirements", description: "The agreed acceptance criteria are met with only minor corrections needed." },
  { rating: 4, label: "Exceeds requirements", description: "The work is accurate, thorough, and exceeds the agreed quality expectations." },
  { rating: 5, label: "Exceptional quality", description: "The work clearly exceeds expectations, with specific evidence of added value and no material corrections needed." },
] as const;

export type ReviewWindow = { start: Date; end: Date };
export type ReviewPeriod = ReviewWindow & { value: string; label: string; startDay: string; endDay: string };
export type ReviewEvidence = {
  id: string;
  taskId: string;
  employeeId: string;
  rating: number | null;
  createdAt: Date | string;
  submittedAt: Date | string;
  decision: string;
};
export type ReviewEvidenceDetail = ReviewEvidence & { employeeName: string; employeeAvatarUrl?: string | null; taskTitle: string; reviewerName: string; feedback: string };

const dayMilliseconds = 86_400_000;
const indiaOffset = 330 * 60_000;

export function isReviewRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function getReviewPeriod(value?: string, now = new Date()): ReviewPeriod {
  const choice = REVIEW_PERIODS.find(period => period.value === value) ?? REVIEW_PERIODS[1];
  const endDay = new Date(now.getTime() + indiaOffset).toISOString().slice(0, 10);
  const todayStart = new Date(`${endDay}T00:00:00+05:30`);
  const start = new Date(todayStart.getTime() - (choice.days - 1) * dayMilliseconds);
  return {
    ...choice,
    start,
    end: new Date(todayStart.getTime() + dayMilliseconds),
    startDay: new Date(start.getTime() + indiaOffset).toISOString().slice(0, 10),
    endDay,
  };
}

export function getReviewMonths(now = new Date(), count = 6) {
  const indiaNow = new Date(now.getTime() + indiaOffset);
  return Array.from({ length: count }, (_, index) => {
    const month = new Date(Date.UTC(indiaNow.getUTCFullYear(), indiaNow.getUTCMonth() - count + index + 1, 1));
    return {
      start: new Date(month.getTime() - indiaOffset),
      end: new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1) - indiaOffset),
      label: month.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    };
  });
}

export function reviewQualityLabel(score: number | null, ratedTaskCount: number) {
  if (score === null) return ratedTaskCount ? "Limited evidence" : "Not rated";
  return score >= 90 ? "Excellent" : score >= 80 ? "Good" : score >= 60 ? "Meets requirements" : "Needs review";
}

export function summarizeReviewQuality(reviews: readonly ReviewEvidence[], window: ReviewWindow, leaveByEmployee: LeaveDaysByEmployee = {}) {
  const latest = new Map<string, ReviewEvidence>();
  let reviewCount = 0;
  let revisionCount = 0;
  for (const review of reviews) {
    const timestamp = new Date(review.createdAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp < window.start.getTime() || timestamp >= window.end.getTime()) continue;
    const submitted = new Date(review.submittedAt);
    if (!Number.isFinite(submitted.getTime()) || !isCompanyWorkday(employeeDayKey(submitted), employeeLeaveDays(leaveByEmployee, review.employeeId))) continue;
    if (review.decision === "REVISION_REQUESTED") revisionCount++;
    if (!isReviewRating(review.rating) || !review.taskId || !review.employeeId) continue;
    reviewCount++;
    // Attribute work to its submitter, even if the task has since been reassigned.
    const key = JSON.stringify([review.employeeId, review.taskId]);
    const previous = latest.get(key);
    if (!previous || timestamp > new Date(previous.createdAt).getTime() ||
      (timestamp === new Date(previous.createdAt).getTime() && review.id > previous.id)) {
      latest.set(key, review);
    }
  }
  const people = new Map<string, { employeeId: string; total: number; ratedTaskCount: number }>();
  for (const review of latest.values()) {
    const person = people.get(review.employeeId) ?? { employeeId: review.employeeId, total: 0, ratedTaskCount: 0 };
    person.total += review.rating!;
    person.ratedTaskCount++;
    people.set(review.employeeId, person);
  }
  const employees = [...people.values()].map(person => ({
    employeeId: person.employeeId,
    ratedTaskCount: person.ratedTaskCount,
    // Keep full precision until the final aggregate to avoid rounding bias.
    average: person.ratedTaskCount >= MIN_REVIEWED_TASKS ? person.total / person.ratedTaskCount : null,
  }));
  const eligible = employees.filter((person): person is typeof person & { average: number } => person.average !== null);
  const score = eligible.length ? Math.round(eligible.reduce((sum, person) => sum + person.average, 0) / eligible.length * 20) : null;
  return {
    score,
    label: reviewQualityLabel(score, latest.size),
    ratedTaskCount: latest.size,
    reviewCount,
    revisionCount,
    employeeCount: employees.length,
    eligibleEmployeeCount: eligible.length,
    contributingTaskCount: eligible.reduce((sum, person) => sum + person.ratedTaskCount, 0),
    latestReviewIds: [...latest.values()].map(review => review.id).sort(),
    employees: employees.map(person => ({
      employeeId: person.employeeId,
      ratedTaskCount: person.ratedTaskCount,
      score: person.average === null ? null : Math.round(person.average * 20),
    })),
  };
}

export type ReviewQualitySummary = ReturnType<typeof summarizeReviewQuality>;
