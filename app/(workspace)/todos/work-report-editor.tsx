"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { parseWorkReport, validReportDate, type DailyWorkReport } from "@/lib/work-reports";
import { PersonalDialog } from "./personal-task-dialogs";

type Draft = { completedWork: string; nextSteps: string; blockers: string; hours: string };
const emptyDraft: Draft = { completedWork: "", nextSteps: "", blockers: "", hours: "" };

export default function WorkReportEditor({ initialDate, onClose, onSaved }: { initialDate: string; onClose: () => void; onSaved: (report: DailyWorkReport) => void }) {
  const [date, setDate] = useState(initialDate);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [original, setOriginal] = useState<Draft>(emptyDraft);
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false); setError(null);
    if (!validReportDate(date)) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    async function load() {
      try {
        const response = await fetch(`/api/personal-work-reports/${date}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load this report.");
        const report: DailyWorkReport | null = data.report;
        const values = report ? { completedWork: report.completedWork, nextSteps: report.nextSteps ?? "", blockers: report.blockers ?? "", hours: report.minutesWorked === null ? "" : String(Number((report.minutesWorked / 60).toFixed(2))) } : emptyDraft;
        if (!controller.signal.aborted) { setDraft(values); setOriginal(values); setExists(Boolean(report)); setLoaded(true); }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load this report."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [date, retry]);

  function chooseDate(value: string) {
    if (JSON.stringify(draft) !== JSON.stringify(original) && !window.confirm("Discard unsaved changes and open another date?")) return;
    setDate(value);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || saving || !validReportDate(date)) return;
    const parsed = parseWorkReport({ completedWork: draft.completedWork, nextSteps: draft.nextSteps, blockers: draft.blockers, minutesWorked: draft.hours === "" ? null : Math.round(Number(draft.hours) * 60) });
    if (parsed.error) { setError(parsed.error); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/personal-work-reports/${date}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save this report.");
      onSaved(data.report);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save this report. Your draft is still here."); }
    finally { setSaving(false); }
  }

  return <PersonalDialog title="Daily Work Report" onClose={onClose}>
    <p className="personal-muted work-report-editor-intro">Save what you worked on each day. These entries become your monthly report.</p>
    {error ? <p role="alert" className="workspace-form-error">{error}{!loaded ? <button type="button" className="underline ml-2" onClick={() => setRetry(value => value + 1)}>Retry</button> : null}</p> : null}
    <form onSubmit={event => void save(event)} className="work-report-editor">
      <div className="work-report-editor-date"><label className="workspace-field">Report date<input required type="date" name="reportDate" value={date} onChange={event => chooseDate(event.target.value)} disabled={saving}/></label><span className="personal-muted" role="status">{loading ? "Loading report…" : loaded ? exists ? "Editing your saved report" : "New daily report" : "Choose a report date"}</span></div>
      <fieldset disabled={loading || !loaded || saving} className="work-report-fields">
        <label className="workspace-field">Work completed<textarea name="completedWork" rows={6} required maxLength={20_000} value={draft.completedWork} onChange={event => setDraft(current => ({ ...current, completedWork: event.target.value }))} placeholder="Summarize the work you completed, deliverables, and results."/></label>
        <div className="work-report-optional-fields"><label className="workspace-field">Next steps <span className="work-report-optional">Optional</span><textarea name="nextSteps" rows={3} maxLength={10_000} value={draft.nextSteps} onChange={event => setDraft(current => ({ ...current, nextSteps: event.target.value }))} placeholder="What is in progress or planned next?"/></label><label className="workspace-field">Blockers <span className="work-report-optional">Optional</span><textarea name="blockers" rows={3} maxLength={10_000} value={draft.blockers} onChange={event => setDraft(current => ({ ...current, blockers: event.target.value }))} placeholder="Any issues or support needed?"/></label></div>
        <label className="workspace-field work-report-hours">Hours worked <span className="work-report-optional">Optional</span><input name="hoursWorked" type="number" min="0" max="24" step="any" inputMode="decimal" placeholder="e.g. 7.5" value={draft.hours} onChange={event => setDraft(current => ({ ...current, hours: event.target.value }))}/></label>
      </fieldset>
      <div className="workspace-dialog-actions"><button type="button" className="workspace-cancel" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="accent-button workspace-standard-button" disabled={loading || !loaded || saving}><Save size={15}/>{saving ? "Saving…" : "Save daily report"}</button></div>
    </form>
  </PersonalDialog>;
}
