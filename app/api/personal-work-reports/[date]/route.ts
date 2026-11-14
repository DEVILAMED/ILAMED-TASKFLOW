import { workReportHandlers } from "@/services/personal-work-reports";

type Context = { params: Promise<{ date: string }> };
async function daily(request: Request, { params }: Context) { return workReportHandlers.daily(request, (await params).date); }
export { daily as GET, daily as PUT, daily as DELETE };
