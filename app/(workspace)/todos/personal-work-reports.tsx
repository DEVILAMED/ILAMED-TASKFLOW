"use client";

import "./work-reports.css";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, CalendarDays, Clock3, Download, FileSpreadsheet, FileText, Plus, Printer, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import WorkspacePageHeading from "@/app/workspace-page-heading";
import { employeeDayKey } from "@/lib/employee-dashboard";
import { escapeReportHtml, monthlyReportCsv, monthlyReportText, monthlyWorkReport, reportDayLabel, reportHours, reportMonthLabel, reportMonthRange, type DailyWorkReport } from "@/lib/work-reports";
import { PersonalDialog } from "./personal-task-dialogs";
import WorkReportEditor from "./work-report-editor";

export default function PersonalWorkReports({ userName }: { userName: string }) {
  const params = useSearchParams();
  const today = employeeDayKey();
  const monthParam = params.get("month");
  const month = monthParam && reportMonthRange(monthParam) ? monthParam : today.slice(0, 7);
  const currentMonth = useRef(month);
  currentMonth.current = month;
  const [reports, setReports] = useState<DailyWorkReport[]>([]);
  const [loadedMonth, setLoadedMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DailyWorkReport | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const summary = monthlyWorkReport(loadedMonth === month ? reports : [], month);
  const entries = [...summary.entries].reverse();

  function chooseMonth(value: string) {
    if (!reportMonthRange(value)) return;
    const url = new URL(window.location.href); url.searchParams.set("month", value);
    window.history.replaceState(null, "", url);
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setPreview(false);
    async function load() {
      try {
        const response = await fetch(`/api/personal-work-reports?month=${month}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load daily reports.");
        if (!controller.signal.aborted) { setReports(data.reports); setLoadedMonth(month); }
      } catch (failure) { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "Unable to load daily reports."); setLoadedMonth(""); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [month, refresh]);

  function saved(report: DailyWorkReport) {
    setReports(current => [...current.filter(item => item.reportDate !== report.reportDate), report]);
    setEditorDate(null); setNotice(`Daily report saved for ${reportDayLabel(report.reportDate)}.`);
    if (report.reportDate.slice(0, 7) !== month) chooseMonth(report.reportDate.slice(0, 7));
    else { setLoadedMonth(month); setRefresh(value => value + 1); }
  }
  async function remove() {
    if (!deleting || deletingBusy) return;
    setDeletingBusy(true); setError(null);
    try {
      const response = await fetch(`/api/personal-work-reports/${deleting.reportDate}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete this report.");
      setReports(current => current.filter(report => report.id !== deleting.id)); setDeleting(null); setPreview(false); setNotice("Daily report deleted."); setRefresh(value => value + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to delete this report."); }
    finally { setDeletingBusy(false); }
  }
  async function generate() {
    setGenerating(true); setError(null);
    try {
      const response = await fetch(`/api/personal-work-reports?month=${month}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate your monthly report.");
      if (currentMonth.current === month) { setReports(data.reports); setLoadedMonth(month); setPreview(true); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to generate your monthly report."); }
    finally { setGenerating(false); }
  }
  function download(csv = false) {
    const content = csv ? monthlyReportCsv(summary.entries, month) : monthlyReportText(summary.entries, month, userName);
    const url = URL.createObjectURL(new Blob([content], { type: csv ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `work-report-${month}.${csv ? "csv" : "txt"}`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function print() {
    const frame = document.createElement("iframe"); frame.title = "Monthly work report print preview"; frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0"; document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) { frame.remove(); return; }
    doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Monthly Work Report - ${escapeReportHtml(month)}</title><style>@page{size:A4;margin:18mm}body{font:13px/1.6 Arial,sans-serif;color:#203047}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:22px}</style></head><body><h1>ILAMED · Monthly Work Report</h1><pre>${escapeReportHtml(monthlyReportText(summary.entries, month, userName))}</pre></body></html>`); doc.close();
    window.setTimeout(() => { if (!frame.contentWindow) { frame.remove(); return; } frame.contentWindow.onafterprint = () => frame.remove(); frame.contentWindow.focus(); frame.contentWindow.print(); }, 250);
  }
  const unavailable = loading || loadedMonth !== month || generating;
  return <div className="workspace-view personal-workspace work-reports-workspace">
    <WorkspacePageHeading kicker="PERSONAL WORKSPACE" title="Work Reports" description="Save your daily work and bring it together into a monthly report." action={<button type="button" className="accent-button workspace-standard-button" onClick={() => { setError(null); setEditorDate(month === today.slice(0, 7) ? today : `${month}-01`); }}><Plus size={16}/> Daily report</button>}/>
    {notice ? <p role="status" className="personal-notice">{notice}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button></p> : null}
    {error ? <p role="alert" className="workspace-form-error">{error} <button type="button" className="underline" onClick={() => setRefresh(value => value + 1)}>Retry</button></p> : null}
    <section className="workspace-surface work-reports-period"><div><h2>Report period</h2><p className="personal-muted">Daily entries and monthly reports are saved under your account.</p></div><div><label className="workspace-field">Month<input type="month" aria-label="Report month" value={month} disabled={generating} onChange={event => chooseMonth(event.target.value)}/></label><button type="button" className="secondary-button workspace-standard-button" aria-label="Refresh work reports" disabled={loading || generating} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15}/></button></div></section>
    <section className="work-report-metrics" aria-label="Monthly work report summary">{[{ label: "Days reported", value: summary.daysReported, icon: CalendarDays }, { label: "Hours logged", value: reportHours(summary.minutesWorked), icon: Clock3 }, { label: "Days with blockers", value: summary.daysWithBlockers, icon: TriangleAlert }].map(({ label, value, icon: Icon }) => <article className="employee-summary-card" key={label}><div><span>{label}</span><strong>{unavailable ? "—" : value}</strong></div><Icon size={19} strokeWidth={1.7}/></article>)}</section>
    <section className="workspace-surface work-report-combine"><span className="workspace-export-icon"><FileText size={22}/></span><div><h2>Monthly Work Report</h2><p className="personal-muted">Combine your saved daily entries for {reportMonthLabel(month)} into one report.</p></div><button type="button" className="accent-button workspace-standard-button" disabled={unavailable || !summary.entries.length} onClick={() => void generate()}><BookOpen size={15}/>{generating ? "Generating…" : "Generate monthly report"}</button></section>
    {preview && !unavailable ? <section className="workspace-surface work-monthly-preview" aria-label="Monthly report preview"><div className="work-monthly-heading"><div><p className="personal-eyebrow">MONTHLY WORK REPORT</p><h2>{reportMonthLabel(month)}</h2><p className="personal-muted">{userName} · {summary.daysReported} days reported · {reportHours(summary.minutesWorked)} logged</p></div><div className="work-report-downloads"><button type="button" className="secondary-button workspace-standard-button" onClick={() => download()} disabled={!summary.entries.length}><Download size={14}/> Download report</button><button type="button" className="secondary-button workspace-standard-button" onClick={() => download(true)} disabled={!summary.entries.length}><FileSpreadsheet size={14}/> CSV</button><button type="button" className="accent-button workspace-standard-button" onClick={print} disabled={!summary.entries.length}><Printer size={14}/> Print / PDF</button></div></div>{summary.entries.map(report => <article key={report.id} className="work-monthly-day"><div><h3>{reportDayLabel(report.reportDate)}</h3><span>{reportHours(report.minutesWorked)}</span></div><h4>Work completed</h4><p>{report.completedWork}</p>{report.nextSteps ? <><h4>Next steps</h4><p>{report.nextSteps}</p></> : null}{report.blockers ? <><h4>Blockers</h4><p>{report.blockers}</p></> : null}</article>)}</section> : null}
    <section className="workspace-surface work-daily-reports"><div className="employee-panel-heading"><h2>Daily Reports</h2><span className="personal-muted">{reportMonthLabel(month)}</span></div>{loading ? <p role="status" className="personal-empty">Loading your daily reports…</p> : !entries.length ? <div className="personal-empty"><FileText size={30}/><h2>{loadedMonth === month ? "No reports for this month yet." : "Reports could not be loaded."}</h2><p>Save a daily report to start building your monthly summary.</p></div> : <div className="work-daily-list">{entries.map(report => <article key={report.id}><div className="work-daily-date"><CalendarDays size={17}/><div><button type="button" onClick={() => setEditorDate(report.reportDate)}>{reportDayLabel(report.reportDate)}</button><span>{reportHours(report.minutesWorked)}</span></div></div><p className="work-daily-excerpt">{report.completedWork}</p><div className="work-daily-actions"><button type="button" className="secondary-button workspace-standard-button" aria-label={`Edit report ${report.reportDate}`} onClick={() => setEditorDate(report.reportDate)}>Edit report</button><button type="button" className="personal-delete-button" aria-label={`Delete report ${report.reportDate}`} onClick={() => { setError(null); setDeleting(report); }}><Trash2 size={15}/></button></div></article>)}</div>}</section>
    {editorDate ? <WorkReportEditor initialDate={editorDate} onClose={() => setEditorDate(null)} onSaved={saved}/> : null}
    {deleting ? <PersonalDialog title="Delete daily report?" onClose={() => { if (!deletingBusy) setDeleting(null); }}><p className="personal-muted">Delete the report for {reportDayLabel(deleting.reportDate)}? It will also be removed from the combined monthly report.</p>{error ? <p role="alert" className="workspace-form-error">{error}</p> : null}<div className="workspace-dialog-actions work-report-delete-actions"><button type="button" className="workspace-cancel" disabled={deletingBusy} onClick={() => setDeleting(null)}>Keep report</button><button type="button" className="personal-delete-button" disabled={deletingBusy} onClick={() => void remove()}>{deletingBusy ? "Deleting…" : "Delete report"}</button></div></PersonalDialog> : null}
  </div>;
}
