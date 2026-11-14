import type { DailyWorkReport as StoredReport } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createWorkReportHandlers } from "@/lib/work-reports";

function serialize(report: StoredReport) {
  return { id: report.id, reportDate: report.reportDate.toISOString().slice(0, 10), completedWork: report.completedWork, nextSteps: report.nextSteps, blockers: report.blockers, minutesWorked: report.minutesWorked, createdAt: report.createdAt.toISOString(), updatedAt: report.updatedAt.toISOString() };
}

export const workReportHandlers = createWorkReportHandlers({ currentUser: getCurrentUser, store: {
  async list(userId, { start, end }) { return (await prisma.dailyWorkReport.findMany({ where: { userId, reportDate: { gte: start, lt: end } }, orderBy: { reportDate: "desc" } })).map(serialize); },
  async find(userId, date) { const report = await prisma.dailyWorkReport.findUnique({ where: { userId_reportDate: { userId, reportDate: new Date(`${date}T00:00:00.000Z`) } } }); return report ? serialize(report) : null; },
  async save(userId, date, data) { const reportDate = new Date(`${date}T00:00:00.000Z`); return serialize(await prisma.dailyWorkReport.upsert({ where: { userId_reportDate: { userId, reportDate } }, create: { userId, reportDate, ...data }, update: data })); },
  async remove(userId, date) { return (await prisma.dailyWorkReport.deleteMany({ where: { userId, reportDate: new Date(`${date}T00:00:00.000Z`) } })).count; },
} });
