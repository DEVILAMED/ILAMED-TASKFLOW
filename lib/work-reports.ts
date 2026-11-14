export type WorkReportData = { completedWork: string; nextSteps: string | null; blockers: string | null; minutesWorked: number | null };
export type DailyWorkReport = WorkReportData & { id: string; reportDate: string; createdAt: string; updatedAt: string };

export function validReportDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function reportMonthRange(value: unknown): { start: Date; end: Date } | null {
  if (typeof value !== "string" || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const start = new Date(`${value}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

export function parseWorkReport(payload: unknown): { data: WorkReportData; error?: never } | { error: string; data?: never } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { error: "Enter a valid daily report." };
  const fields = payload as Record<string, unknown>;
  if (typeof fields.completedWork !== "string" || !fields.completedWork.trim()) return { error: "Describe the work you completed." };
  if (fields.completedWork.trim().length > 20_000) return { error: "Work completed must be 20,000 characters or fewer." };
  for (const name of ["nextSteps", "blockers"] as const) {
    const value = fields[name];
    if (value !== undefined && value !== null && (typeof value !== "string" || value.length > 10_000)) return { error: "Next steps and blockers must be text with 10,000 characters or fewer." };
  }
  const minutesWorked = fields.minutesWorked ?? null;
  if (minutesWorked !== null && (typeof minutesWorked !== "number" || !Number.isInteger(minutesWorked) || minutesWorked < 0 || minutesWorked > 1440)) return { error: "Hours worked must be between 0 and 24 hours." };
  return { data: { completedWork: fields.completedWork.trim(), nextSteps: typeof fields.nextSteps === "string" ? fields.nextSteps.trim() || null : null, blockers: typeof fields.blockers === "string" ? fields.blockers.trim() || null : null, minutesWorked } };
}

export function monthlyWorkReport(reports: readonly DailyWorkReport[], month: string) {
  const entries = reportMonthRange(month) ? reports.filter(report => report.reportDate.slice(0, 7) === month).sort((a, b) => a.reportDate.localeCompare(b.reportDate)) : [];
  const logged = entries.filter(report => report.minutesWorked !== null);
  return { entries, daysReported: entries.length, minutesWorked: logged.length ? logged.reduce((sum, report) => sum + report.minutesWorked!, 0) : null, daysWithBlockers: entries.filter(report => report.blockers?.trim()).length };
}

export function reportMonthLabel(month: string) {
  return new Date(`${month}-01T12:00:00.000Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function reportHours(minutes: number | null) { return minutes === null ? "Not logged" : `${Number((minutes / 60).toFixed(2))}h`; }
export function reportDayLabel(day: string) { return new Date(`${day}T12:00:00.000Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }

export function monthlyReportText(reports: readonly DailyWorkReport[], month: string, author: string) {
  const summary = monthlyWorkReport(reports, month);
  return [`MONTHLY WORK REPORT — ${reportMonthLabel(month)}`, `Prepared by: ${author}`, `Days reported: ${summary.daysReported}`, `Hours logged: ${reportHours(summary.minutesWorked)}`, "", ...summary.entries.flatMap(report => [reportDayLabel(report.reportDate), `Hours worked: ${reportHours(report.minutesWorked)}`, "Work completed:", report.completedWork, ...(report.nextSteps ? ["Next steps:", report.nextSteps] : []), ...(report.blockers ? ["Blockers:", report.blockers] : []), "", "────────────────────────────────────────", ""])].join("\n");
}

export function monthlyReportCsv(reports: readonly DailyWorkReport[], month: string) {
  const rows = [["Date", "Work completed", "Next steps", "Blockers", "Hours worked"], ...monthlyWorkReport(reports, month).entries.map(report => [report.reportDate, report.completedWork, report.nextSteps ?? "", report.blockers ?? "", report.minutesWorked === null ? "" : String(Number((report.minutesWorked / 60).toFixed(2)))])];
  return "\ufeff" + rows.map(row => row.map(value => `"${(/^[\s]*[=+@\-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
}

export function escapeReportHtml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }

type WorkReportStore = {
  list: (userId: string, range: { start: Date; end: Date }) => Promise<DailyWorkReport[]>;
  find: (userId: string, date: string) => Promise<DailyWorkReport | null>;
  save: (userId: string, date: string, data: WorkReportData) => Promise<DailyWorkReport>;
  remove: (userId: string, date: string) => Promise<number>;
};

export function createWorkReportHandlers({ currentUser, store }: { currentUser: () => Promise<{ id: string } | null>; store: WorkReportStore }) {
  const result = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  return {
    async list(request: Request) {
      const user = await currentUser();
      if (!user) return result({ ok: false, error: "Unauthorized." }, 401);
      const month = new URL(request.url).searchParams.get("month");
      const range = reportMonthRange(month);
      if (!range) return result({ ok: false, error: "Choose a valid report month." }, 400);
      try { return result({ ok: true, reports: await store.list(user.id, range) }); }
      catch { return result({ ok: false, error: "Unable to load work reports. Please try again." }, 503); }
    },
    async daily(request: Request, date: string) {
      const user = await currentUser();
      if (!user) return result({ ok: false, error: "Unauthorized." }, 401);
      if (!validReportDate(date)) return result({ ok: false, error: "Choose a valid report date." }, 400);
      try {
        if (request.method === "GET") return result({ ok: true, report: await store.find(user.id, date) });
        if (request.method === "DELETE") {
          const count = await store.remove(user.id, date);
          return count ? result({ ok: true }) : result({ ok: false, error: "Report not found." }, 404);
        }
        if (request.method !== "PUT") return result({ ok: false, error: "Method not allowed." }, 405);
        let payload: unknown;
        try { payload = await request.json(); } catch { return result({ ok: false, error: "Invalid request body." }, 400); }
        const parsed = parseWorkReport(payload);
        if (parsed.error) return result({ ok: false, error: parsed.error }, 400);
        return result({ ok: true, report: await store.save(user.id, date, parsed.data!) });
      } catch { return result({ ok: false, error: "Unable to save or load this report. Please try again." }, 503); }
    },
  };
}
