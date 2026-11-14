import assert from "node:assert/strict";
import test from "node:test";
import { createWorkReportHandlers, escapeReportHtml, monthlyReportCsv, monthlyReportText, monthlyWorkReport, parseWorkReport, reportHours, reportMonthRange, validReportDate } from "./work-reports.ts";

const base = { completedWork: "Completed a design review.", nextSteps: null, blockers: null, minutesWorked: null };
const entry = (date, changes = {}) => ({ id: date, reportDate: date, createdAt: `${date}T12:00:00Z`, updatedAt: `${date}T12:00:00Z`, ...base, ...changes });
const request = (method, body, query = "") => new Request(`https://workspace.local/api/personal-work-reports${query}`, { method, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });

test("report dates reject invalid calendar dates and month ranges handle leap years and December", () => {
  for (const value of ["2026-02-29", "2026-11-31", "2026-00-10", "2026-11-14T00:00:00Z", "0000-01-01", null]) assert.equal(validReportDate(value), false);
  assert.equal(validReportDate("2024-02-29"), true);
  assert.equal(validReportDate("2026-11-14"), true);
  const range = reportMonthRange("2026-12");
  assert.equal(range.start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(range.end.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(reportMonthRange("2026-13"), null);
  assert.equal(reportMonthRange("2026-1"), null);
});

test("daily validation requires work, limits content and validates logged minutes", () => {
  for (const payload of [null, [], "text", {}, { completedWork: "   " }, { ...base, completedWork: "x".repeat(20_001) }, { ...base, nextSteps: 12 }, { ...base, blockers: "x".repeat(10_001) }, ...[-1, 1441, 1.2, "60", NaN].map(minutesWorked => ({ ...base, minutesWorked }))]) assert.ok(parseWorkReport(payload).error);
  assert.deepEqual(parseWorkReport({ completedWork: "  Reviewed code.  ", nextSteps: "  ", minutesWorked: 0 }).data, { completedWork: "Reviewed code.", nextSteps: null, blockers: null, minutesWorked: 0 });
  assert.equal(parseWorkReport({ ...base, minutesWorked: 1440 }).data.minutesWorked, 1440);
});

test("monthly compilation includes only selected-month reports in date order without changing source data", () => {
  const reports = [entry("2026-11-30", { minutesWorked: 90, blockers: "Awaiting feedback" }), entry("2026-12-01", { minutesWorked: 600 }), entry("2026-11-01", { minutesWorked: 0 }), entry("2026-11-12")];
  const result = monthlyWorkReport(reports, "2026-11");
  assert.deepEqual(result.entries.map(report => report.reportDate), ["2026-11-01", "2026-11-12", "2026-11-30"]);
  assert.equal(result.daysReported, 3); assert.equal(result.minutesWorked, 90); assert.equal(result.daysWithBlockers, 1);
  assert.equal(reports[0].reportDate, "2026-11-30");
  assert.equal(monthlyWorkReport([entry("2026-11-01")], "2026-11").minutesWorked, null);
  assert.equal(reportHours(0), "0h"); assert.equal(reportHours(null), "Not logged");
  assert.equal(monthlyWorkReport(reports, "invalid").daysReported, 0);
});

test("monthly downloads retain daily content and safely encode spreadsheet and print input", () => {
  const reports = [entry("2026-11-14", { completedWork: '=HYPERLINK("bad")\nsecond line', nextSteps: "Plan next week", blockers: "Need approval", minutesWorked: 450 }), entry("2026-12-01", { completedWork: "Other month" })];
  const text = monthlyReportText(reports, "2026-11", "Alex Example");
  for (const value of ["November 2026", "Alex Example", "7.5h", "second line", "Plan next week", "Need approval"]) assert.ok(text.includes(value));
  assert.ok(!text.includes("Other month"));
  const csv = monthlyReportCsv(reports, "2026-11");
  assert.ok(csv.includes(`"'=HYPERLINK(""bad"")\nsecond line"`));
  assert.ok(!csv.includes("Other month"));
  assert.equal(escapeReportHtml('<script>"&\'</script>'), "&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;");
});

function fixture(user = { id: "owner" }) {
  const rows = new Map([["victim:2026-11-14", entry("2026-11-14", { completedWork: "Private to another account" })]]);
  const calls = [];
  const handlers = createWorkReportHandlers({ currentUser: async () => user, store: {
    async list(userId, range) { calls.push(["list", userId]); return [...rows].filter(([key, row]) => key.startsWith(`${userId}:`) && new Date(row.reportDate) >= range.start && new Date(row.reportDate) < range.end).map(([, row]) => row); },
    async find(userId, date) { calls.push(["find", userId, date]); return rows.get(`${userId}:${date}`) ?? null; },
    async save(userId, date, data) { calls.push(["save", userId, date]); const report = entry(date, data); rows.set(`${userId}:${date}`, report); return report; },
    async remove(userId, date) { calls.push(["remove", userId, date]); return Number(rows.delete(`${userId}:${date}`)); },
  } });
  return { handlers, rows, calls };
}

test("anonymous requests cannot read, save, or delete reports", async () => {
  const { handlers, calls } = fixture(null);
  assert.equal((await handlers.list(request("GET", undefined, "?month=2026-11"))).status, 401);
  for (const method of ["GET", "PUT", "DELETE"]) assert.equal((await handlers.daily(request(method, method === "PUT" ? base : undefined), "2026-11-14")).status, 401);
  assert.deepEqual(calls, []);
});

test("report reads and deletes stay scoped to the signed-in user even when dates match", async () => {
  const { handlers, rows, calls } = fixture();
  const list = await handlers.list(request("GET", undefined, "?month=2026-11&userId=victim"));
  assert.deepEqual((await list.json()).reports, []);
  const detail = await handlers.daily(request("GET"), "2026-11-14");
  assert.equal((await detail.json()).report, null);
  assert.equal((await handlers.daily(request("DELETE"), "2026-11-14")).status, 404);
  assert.equal(rows.size, 1); assert.ok(calls.every(call => call[1] === "owner"));
});

test("saving the same day updates the existing report and ignores forged ownership or report dates", async () => {
  const { handlers, rows } = fixture();
  const first = await handlers.daily(request("PUT", { ...base, userId: "victim", reportDate: "2026-12-31" }), "2026-11-14");
  assert.equal(first.status, 200);
  await handlers.daily(request("PUT", { ...base, completedWork: "Updated daily work" }), "2026-11-14");
  assert.equal(rows.size, 2); assert.equal(rows.get("owner:2026-11-14").completedWork, "Updated daily work");
  assert.equal(rows.get("victim:2026-11-14").completedWork, "Private to another account");
  assert.equal((await handlers.daily(request("DELETE"), "2026-11-14")).status, 200);
  assert.equal(rows.size, 1);
});

test("bad dates, invalid JSON, and invalid report content never reach report storage", async () => {
  const { handlers, calls } = fixture();
  assert.equal((await handlers.list(request("GET", undefined, "?month=2026-13"))).status, 400);
  assert.equal((await handlers.daily(request("PUT", base), "2026-11-31")).status, 400);
  assert.equal((await handlers.daily(request("PUT", "{"), "2026-11-14")).status, 400);
  assert.equal((await handlers.daily(request("PUT", { completedWork: " " }), "2026-11-14")).status, 400);
  assert.deepEqual(calls, []);
});
