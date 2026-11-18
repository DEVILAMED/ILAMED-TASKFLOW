import assert from "node:assert/strict";
import test from "node:test";
import { getReviewMonths, getReviewPeriod, isReviewRating, reviewQualityLabel, summarizeReviewQuality } from "./review-quality.ts";

const period = getReviewPeriod("90", new Date("2026-11-18T10:00:00Z"));
const review = (id, rating, overrides = {}) => ({ id, taskId: id, employeeId: "alex", rating, decision: "APPROVED", createdAt: "2026-11-10T10:00:00Z", submittedAt: "2026-11-10T09:00:00Z", ...overrides });
const work = (employeeId, ratings) => ratings.map((rating, index) => review(`${employeeId}-${index}`, rating, { employeeId }));

test("Sunday and employee leave exclude submissions by India date, regardless of the manager's review date", () => {
  const ratings = [
    ...work("alex", [3, 3, 3, 3]),
    review("saturday", 3, { submittedAt: "2026-11-14T18:29:59Z", createdAt: "2026-11-15T10:00:00Z" }),
    review("sunday", 1, { submittedAt: "2026-11-14T18:30:00Z", createdAt: "2026-11-16T10:00:00Z" }),
    review("employee-leave", 1, { submittedAt: "2026-11-15T18:30:00Z", createdAt: "2026-11-17T10:00:00Z" }),
  ];
  const result = summarizeReviewQuality(ratings, period, { alex: ["2026-11-16"] });
  assert.equal(result.score, 60);
  assert.deepEqual(result.latestReviewIds, ["alex-0", "alex-1", "alex-2", "alex-3", "saturday"]);
  assert.ok(summarizeReviewQuality(ratings, period, { beth: ["2026-11-16"] }).latestReviewIds.includes("employee-leave"));
});

test("a single perfect rating cannot produce a score or an Excellent label", () => {
  const result = summarizeReviewQuality([review("only-task", 5)], period);
  assert.equal(result.score, null);
  assert.equal(result.label, "Limited evidence");
  assert.equal(result.ratedTaskCount, 1);
  assert.equal(result.eligibleEmployeeCount, 0);
  assert.equal(summarizeReviewQuality([], period).label, "Not rated");
});

test("five distinct tasks establish a quality score; invalid and unrated feedback are excluded", () => {
  const evidence = work("alex", [4, 3, 5, 3, 2]);
  for (const rating of [null, undefined, 0, 6, 4.5, "5", NaN]) evidence.push(review(`invalid-${String(rating)}`, rating));
  const result = summarizeReviewQuality(evidence, period);
  assert.equal(result.score, 68);
  assert.equal(result.ratedTaskCount, 5);
  assert.equal(result.reviewCount, 5);
  assert.equal(result.label, "Meets requirements");
});

test("revisions retain their history but only the latest rated review per task contributes", () => {
  const evidence = [
    ...work("alex", [4, 4, 4, 4]),
    review("early", 1, { taskId: "reworked", createdAt: "2026-11-01", decision: "REVISION_REQUESTED" }),
    review("middle", 2, { taskId: "reworked", createdAt: "2026-11-02", decision: "REVISION_REQUESTED" }),
    review("final", 5, { taskId: "reworked", createdAt: "2026-11-03" }),
    review("unrated", null, { taskId: "reworked", createdAt: "2026-11-04" }),
  ];
  const result = summarizeReviewQuality(evidence, period);
  assert.equal(result.score, 84);
  assert.equal(result.ratedTaskCount, 5);
  assert.equal(result.reviewCount, 7);
  assert.equal(result.revisionCount, 2);
  assert.deepEqual(summarizeReviewQuality(evidence.toReversed(), period), result);
});

test("repeated reviews of a single task cannot satisfy the five-task evidence threshold", () => {
  const result = summarizeReviewQuality(Array.from({ length: 10 }, (_, index) => review(String(index), 5, { taskId: "same-task", createdAt: `2026-11-${String(index + 1).padStart(2, "0")}` })), period);
  assert.equal(result.score, null);
  assert.equal(result.ratedTaskCount, 1);
  assert.equal(result.reviewCount, 10);
});

test("team quality weights eligible employees equally and reports excluded evidence", () => {
  const result = summarizeReviewQuality([
    ...work("alex", [1, 1, 1, 1, 1]),
    ...work("beth", Array(20).fill(5)),
    ...work("chris", [5, 5, 5, 5]),
  ], period);
  assert.equal(result.score, 60);
  assert.equal(result.employeeCount, 3);
  assert.equal(result.eligibleEmployeeCount, 2);
  assert.equal(result.ratedTaskCount, 29);
  assert.equal(result.contributingTaskCount, 25);
  assert.equal(result.employees.find(person => person.employeeId === "chris").score, null);
});

test("work stays with each submitter when the same task has multiple contributors", () => {
  const alex = work("alex", [2, 2, 2, 2, 2]);
  const beth = work("beth", [5, 5, 5, 5, 5]);
  alex[0].taskId = "reassigned-task";
  beth[0].taskId = "reassigned-task";
  const result = summarizeReviewQuality([...alex, ...beth], period);
  assert.equal(result.ratedTaskCount, 10);
  assert.equal(result.score, 70);
  assert.equal(result.employees.find(person => person.employeeId === "alex").score, 40);
  assert.equal(result.employees.find(person => person.employeeId === "beth").score, 100);
});

test("period boundaries include the first India day and exclude the next day after the period", () => {
  const window = getReviewPeriod("30", new Date("2026-11-18T10:00:00Z"));
  assert.equal(window.startDay, "2026-10-20");
  assert.equal(window.endDay, "2026-11-18");
  assert.equal(window.start.toISOString(), "2026-10-19T18:30:00.000Z");
  assert.equal(window.end.toISOString(), "2026-11-18T18:30:00.000Z");
  const result = summarizeReviewQuality([
    ...work("alex", [3, 3, 3, 3]),
    review("first-moment", 3, { createdAt: window.start }),
    review("before-window", 1, { createdAt: new Date(window.start.getTime() - 1) }),
    review("after-window", 1, { createdAt: window.end }),
    review("bad-date", 1, { createdAt: "invalid" }),
  ], window);
  assert.equal(result.ratedTaskCount, 5);
  assert.equal(result.score, 60);
});

test("defaults and reporting months follow India time across year and leap-day boundaries", () => {
  const indiaNewYear = new Date("2026-12-31T20:00:00Z");
  assert.equal(getReviewPeriod(undefined, indiaNewYear).endDay, "2027-01-01");
  assert.equal(getReviewPeriod("unexpected", indiaNewYear).value, "90");
  const months = getReviewMonths(indiaNewYear, 2);
  assert.deepEqual(months.map(month => month.label), ["Dec", "Jan"]);
  assert.equal(months[1].start.toISOString(), "2026-12-31T18:30:00.000Z");
  assert.equal(months[1].end.toISOString(), "2027-01-31T18:30:00.000Z");
  assert.equal(getReviewPeriod("30", new Date("2028-03-01T10:00:00Z")).startDay, "2028-02-01");
});

test("shared bands recognize meeting expectations and use consistent boundaries", () => {
  assert.equal(reviewQualityLabel(null, 0), "Not rated");
  assert.equal(reviewQualityLabel(null, 4), "Limited evidence");
  assert.equal(reviewQualityLabel(59, 5), "Needs review");
  assert.equal(reviewQualityLabel(60, 5), "Meets requirements");
  assert.equal(reviewQualityLabel(79, 5), "Meets requirements");
  assert.equal(reviewQualityLabel(80, 5), "Good");
  assert.equal(reviewQualityLabel(89, 5), "Good");
  assert.equal(reviewQualityLabel(90, 5), "Excellent");
  assert.equal(reviewQualityLabel(100, 5), "Excellent");
});

test("rating validation requires an explicit integer from one to five", () => {
  for (const value of [undefined, null, "", "5", 0, 6, 2.5, NaN, true]) assert.equal(isReviewRating(value), false);
  for (const value of [1, 2, 3, 4, 5]) assert.equal(isReviewRating(value), true);
});
