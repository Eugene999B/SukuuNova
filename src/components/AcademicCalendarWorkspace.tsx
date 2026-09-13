"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";

type PatternKey = "three_terms" | "two_semesters" | "three_trimesters" | "four_quarters" | "custom";
type Pattern = { key: PatternKey; name: string; description: string; sessionKind: string; labels: string[]; yearEndSequence: number | null };
type Policy = { id: string; sequence: number; sessionKind: string; isYearEnd: boolean; closingStatus: string; teacherMarksCloseAt: string | null; classTeacherReviewCloseAt: string | null; reportApprovalAt: string | null; reportReleaseAt: string | null; lockTargetAt: string | null };
type Term = { id: string; name: string; startDate: string; endDate: string; isLocked: boolean; policy: Policy | null };
type Year = { id: string; name: string; startDate: string; endDate: string; isLocked: boolean; plan: { id: string; patternKey: PatternKey; status: string } | null; calendarSummary: { total: number; instructional: number; vacation: number; holidays: number }; nextAcademicYear: { id: string; name: string; startDate: string } | null; terms: Term[] };
type Readiness = { term: { id: string; name: string }; policy: Policy | null; students: number; assessments: number; scores: number; expectedScores: number; reports: { generated: number; approved: number; released: number }; yearEnd: { enabled: boolean; learners: number; draftDecisions: number; confirmedDecisions: number }; blockers: string[]; warnings: string[]; ready: boolean };
type ReviewDraft = { id: string; studentId: string; studentName: string; admissionNo: string; outcome: string; reason: string | null; sourceAcademicYearId: string; targetGradeName: string | null; targetPathwayName: string | null };
type State = { patterns: Pattern[]; years: Year[]; readiness: Readiness | null; reviewDrafts: ReviewDraft[] };
type SessionForm = { name: string; sequence: number; startDate: string; endDate: string; teachingWeeks: number; isYearEnd: boolean; teacherMarksCloseAt: string; classTeacherReviewCloseAt: string; reportApprovalAt: string; reportReleaseAt: string; lockTargetAt: string };

const human = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const cleanDeadline = (value: string) => value ? new Date(value).toISOString() : null;

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message || body?.error || "Request failed.");
  return body;
}

function sessionsFor(pattern: Pattern): SessionForm[] {
  const labels = pattern.labels.length ? pattern.labels : ["Session 1"];
  return labels.map((name, index) => ({
    name,
    sequence: index + 1,
    startDate: "",
    endDate: "",
    teachingWeeks: 13,
    isYearEnd: pattern.yearEndSequence === index + 1 || (pattern.key === "custom" && index === labels.length - 1),
    teacherMarksCloseAt: "",
    classTeacherReviewCloseAt: "",
    reportApprovalAt: "",
    reportReleaseAt: "",
    lockTargetAt: "",
  }));
}

export default function AcademicCalendarWorkspace() {
  const [state, setState] = useState<State>({ patterns: [], years: [], readiness: null, reviewDrafts: [] });
  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [patternKey, setPatternKey] = useState<PatternKey>("three_terms");
  const [yearForm, setYearForm] = useState({ name: "", startDate: "", endDate: "" });
  const [sessions, setSessions] = useState<SessionForm[]>([]);
  const [override, setOverride] = useState({ calendarDate: "", dayType: "public_holiday", label: "", note: "" });

  async function load(termId = selectedTermId) {
    setError("");
    try {
      const body = await api(`/api/school/academic-calendar${termId ? `?termId=${encodeURIComponent(termId)}` : ""}`) as State;
      setState(body);
      const year = body.years.find((item) => item.id === selectedYearId) ?? body.years[0];
      if (year) {
        setSelectedYearId(year.id);
        const term = year.terms.find((item) => item.id === termId) ?? year.terms[0];
        setSelectedTermId(term?.id ?? "");
      }
      if (!sessions.length && body.patterns.length) {
        const defaultPattern = body.patterns.find((item) => item.key === "three_terms") ?? body.patterns[0];
        setPatternKey(defaultPattern.key);
        setSessions(sessionsFor(defaultPattern));
      }
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to load academic calendar."); }
  }

  useEffect(() => { void load(""); }, []);
  useEffect(() => { if (selectedTermId) void load(selectedTermId); }, [selectedTermId]);

  const selectedYear = useMemo(() => state.years.find((item) => item.id === selectedYearId) ?? null, [state.years, selectedYearId]);
  const selectedTerm = selectedYear?.terms.find((item) => item.id === selectedTermId) ?? null;
  const pattern = state.patterns.find((item) => item.key === patternKey) ?? null;
  const yearDrafts = state.reviewDrafts.filter((item) => item.sourceAcademicYearId === selectedYearId);

  function choosePattern(next: PatternKey) {
    const found = state.patterns.find((item) => item.key === next);
    setPatternKey(next);
    if (found) setSessions(sessionsFor(found));
  }

  function updateSession(index: number, patch: Partial<SessionForm>) {
    setSessions((current) => current.map((item, position) => position === index ? { ...item, ...patch } : item));
  }

  function markYearEnd(index: number) {
    setSessions((current) => current.map((item, position) => ({ ...item, isYearEnd: position === index })));
  }

  function addCustomSession() {
    setSessions((current) => [...current.map((item) => ({ ...item, isYearEnd: false })), {
      name: `Session ${current.length + 1}`,
      sequence: current.length + 1,
      startDate: "",
      endDate: "",
      teachingWeeks: 13,
      isYearEnd: true,
      teacherMarksCloseAt: "",
      classTeacherReviewCloseAt: "",
      reportApprovalAt: "",
      reportReleaseAt: "",
      lockTargetAt: "",
    }]);
  }

  async function createYear(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/school/academic-calendar", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "createYearPlan",
          ...yearForm,
          patternKey,
          sessions: sessions.map((item) => ({
            ...item,
            teacherMarksCloseAt: cleanDeadline(item.teacherMarksCloseAt),
            classTeacherReviewCloseAt: cleanDeadline(item.classTeacherReviewCloseAt),
            reportApprovalAt: cleanDeadline(item.reportApprovalAt),
            reportReleaseAt: cleanDeadline(item.reportReleaseAt),
            lockTargetAt: cleanDeadline(item.lockTargetAt),
          })),
        }),
      });
      setNotice("Academic year created with its sessions, grading periods and day-by-day school calendar.");
      setYearForm({ name: "", startDate: "", endDate: "" });
      if (pattern) setSessions(sessionsFor(pattern));
      await load("");
    } catch (value) { setError(value instanceof Error ? value.message : "Could not create academic year."); }
    finally { setBusy(false); }
  }

  async function run(action: string, payload: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/school/academic-calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      setNotice(success);
      await load(selectedTermId);
    } catch (value) { setError(value instanceof Error ? value.message : "Action failed."); }
    finally { setBusy(false); }
  }

  return <div className="acw-page">
    <section className="acw-hero">
      <div><span className="acw-kicker">ACADEMIC YEAR LIFECYCLE</span><h1>Plan the real school year, not just a list of terms.</h1><p>Dates drive sessions, vacations, instructional days, closing windows and the year-end promotion gate. Ghana Standard defaults to three terms, but semesters, trimesters, quarters and custom calendars use the same engine.</p></div>
      <div className="acw-hero-rule"><CalendarDays size={20}/><strong>One authoritative calendar</strong><span>Year → Sessions → School days → Closing → Rollover</span></div>
    </section>

    {error ? <div className="acw-alert bad">{error}</div> : null}
    {notice ? <div className="acw-alert good">{notice}</div> : null}

    <section className="acw-card">
      <div className="acw-head"><div><span className="acw-kicker">01 · CREATE ACADEMIC YEAR</span><h2>Choose the structure, then enter the actual dates.</h2><p>SukuuNova does not invent equal-length terms. The school records the real start/end dates and any post-term administrative deadlines.</p></div></div>
      <div className="acw-patterns">{state.patterns.map((item) => <button type="button" key={item.key} className={patternKey === item.key ? "active" : ""} onClick={() => choosePattern(item.key)}><strong>{item.name}</strong><small>{item.description}</small></button>)}</div>
      <form onSubmit={createYear} className="acw-plan-form">
        <div className="acw-year-fields">
          <label>Academic year name<input required value={yearForm.name} onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })} placeholder="2026/2027"/></label>
          <label>Academic year starts<input required type="date" value={yearForm.startDate} onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })}/></label>
          <label>Academic year ends<input required type="date" value={yearForm.endDate} onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })}/></label>
        </div>
        <div className="acw-session-list">{sessions.map((session, index) => <article key={session.sequence} className={session.isYearEnd ? "year-end" : ""}>
          <div className="acw-session-title"><div><span>Session {session.sequence}</span><input value={session.name} onChange={(e) => updateSession(index, { name: e.target.value })}/></div><label className="acw-check"><input type="radio" name="yearEnd" checked={session.isYearEnd} onChange={() => markYearEnd(index)}/> Year-end / promotion session</label></div>
          <div className="acw-session-grid">
            <label>Starts<input required type="date" value={session.startDate} onChange={(e) => updateSession(index, { startDate: e.target.value })}/></label>
            <label>Ends<input required type="date" value={session.endDate} onChange={(e) => updateSession(index, { endDate: e.target.value })}/></label>
            <label>Teaching weeks<input required type="number" min={1} max={30} value={session.teachingWeeks} onChange={(e) => updateSession(index, { teachingWeeks: Number(e.target.value) })}/></label>
            <label>Teacher marks deadline<input type="datetime-local" value={session.teacherMarksCloseAt} onChange={(e) => updateSession(index, { teacherMarksCloseAt: e.target.value })}/></label>
            <label>Class teacher review deadline<input type="datetime-local" value={session.classTeacherReviewCloseAt} onChange={(e) => updateSession(index, { classTeacherReviewCloseAt: e.target.value })}/></label>
            <label>Report approval target<input type="datetime-local" value={session.reportApprovalAt} onChange={(e) => updateSession(index, { reportApprovalAt: e.target.value })}/></label>
            <label>Report release target<input type="datetime-local" value={session.reportReleaseAt} onChange={(e) => updateSession(index, { reportReleaseAt: e.target.value })}/></label>
            <label>Lock target<input type="datetime-local" value={session.lockTargetAt} onChange={(e) => updateSession(index, { lockTargetAt: e.target.value })}/></label>
          </div>
        </article>)}</div>
        {patternKey === "custom" ? <button type="button" className="acw-secondary" onClick={addCustomSession}>＋ Add custom session</button> : null}
        <button className="acw-primary" disabled={busy} type="submit">{busy ? "Saving…" : "Create academic year plan"}</button>
      </form>
    </section>

    <section className="acw-card">
      <div className="acw-head"><div><span className="acw-kicker">02 · YEAR TIMELINE</span><h2>Sessions, vacations and instructional days</h2><p>Gaps between sessions become vacation automatically. Calendar events and manual day overrides can remove or restore instructional days without changing term dates.</p></div><select value={selectedYearId} onChange={(e) => { setSelectedYearId(e.target.value); const year = state.years.find((item) => item.id === e.target.value); setSelectedTermId(year?.terms[0]?.id ?? ""); }}><option value="">Choose year</option>{state.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></div>
      {!selectedYear ? <div className="acw-empty">Create an academic year to begin.</div> : <>
        <div className="acw-stats">
          <div><span>Pattern</span><strong>{selectedYear.plan?.patternKey?.replaceAll("_", " ") || "custom"}</strong></div>
          <div><span>Instructional days</span><strong>{selectedYear.calendarSummary.instructional}</strong></div>
          <div><span>Vacation days</span><strong>{selectedYear.calendarSummary.vacation}</strong></div>
          <div><span>Holiday / closure days</span><strong>{selectedYear.calendarSummary.holidays}</strong></div>
        </div>
        <div className="acw-timeline">{selectedYear.terms.map((term) => <button type="button" key={term.id} className={selectedTermId === term.id ? "active" : ""} onClick={() => setSelectedTermId(term.id)}><span>{term.policy?.sequence ?? "—"}</span><div><strong>{term.name}{term.policy?.isYearEnd ? " · YEAR END" : ""}</strong><small>{human(term.startDate)} → {human(term.endDate)}</small></div><em>{term.policy?.closingStatus ?? (term.isLocked ? "locked" : "open")}</em></button>)}</div>
        {selectedYear.nextAcademicYear ? <div className="acw-resume"><Clock3 size={18}/><div><strong>Next academic year: {selectedYear.nextAcademicYear.name}</strong><span>Resumes {human(selectedYear.nextAcademicYear.startDate)}. The gap after this year's end is the long-vacation window.</span></div></div> : <div className="acw-resume"><Clock3 size={18}/><div><strong>Next resumption not scheduled yet</strong><span>Create the next academic year before year-end rollover so the school knows the long-vacation end date.</span></div></div>}
        <div className="acw-override">
          <div><strong>Override one school day</strong><small>Use this for public holidays, closures, exam days, staff-only days or make-up teaching days.</small></div>
          <input type="date" value={override.calendarDate} onChange={(e) => setOverride({ ...override, calendarDate: e.target.value })}/>
          <select value={override.dayType} onChange={(e) => setOverride({ ...override, dayType: e.target.value })}><option value="public_holiday">Public holiday</option><option value="mid_term_break">Mid-term break</option><option value="closure">School closure</option><option value="staff_only">Staff only</option><option value="exam">Exam day</option><option value="makeup">Make-up teaching day</option><option value="instructional">Instructional day</option><option value="special">Special event</option></select>
          <input placeholder="Label" value={override.label} onChange={(e) => setOverride({ ...override, label: e.target.value })}/>
          <button className="acw-secondary" disabled={busy || !override.calendarDate} onClick={() => void run("overrideDay", { academicYearId: selectedYear.id, ...override }, "School calendar day updated.")}>Save day</button>
          <button className="acw-secondary" disabled={busy} onClick={() => void run("refreshCalendar", { academicYearId: selectedYear.id }, "Generated calendar refreshed; manual overrides were preserved.")}><RefreshCw size={15}/> Refresh generated days</button>
        </div>
      </>}
    </section>

    <section className="acw-card">
      <div className="acw-head"><div><span className="acw-kicker">03 · TERM CLOSING</span><h2>End the teaching period, then deliberately close the records.</h2><p>The date ending a term does not silently lock it. Closing readiness separates warnings from blockers; year-end cannot validate until promotion decisions are confirmed.</p></div>{selectedTerm ? <span className="acw-status">{selectedTerm.policy?.closingStatus ?? "legacy"}</span> : null}</div>
      {!selectedTerm ? <div className="acw-empty">Choose a term above.</div> : <>
        {state.readiness?.term.id === selectedTerm.id ? <div className="acw-readiness">
          <div><span>Learners</span><strong>{state.readiness.students}</strong></div><div><span>Scores</span><strong>{state.readiness.scores}/{state.readiness.expectedScores}</strong></div><div><span>Reports</span><strong>{state.readiness.reports.generated}</strong></div><div><span>Year-end decisions</span><strong>{state.readiness.yearEnd.enabled ? `${state.readiness.yearEnd.confirmedDecisions}/${state.readiness.yearEnd.learners}` : "Not required"}</strong></div>
          {state.readiness.blockers.length ? <div className="acw-message blocked"><strong>Blocked</strong>{state.readiness.blockers.map((item) => <span key={item}>{item}</span>)}</div> : <div className="acw-message ready"><CheckCircle2 size={18}/><strong>No hard blockers</strong><span>Warnings still require human review before locking.</span></div>}
          {state.readiness.warnings.length ? <div className="acw-message warning"><strong>Warnings</strong>{state.readiness.warnings.map((item) => <span key={item}>{item}</span>)}</div> : null}
        </div> : null}
        <div className="acw-actions"><button className="acw-secondary" disabled={busy || selectedTerm.isLocked} onClick={() => void run("startClosing", { termId: selectedTerm.id }, `${selectedTerm.name} entered closing review.`)}>Start closing</button><button className="acw-secondary" disabled={busy || selectedTerm.isLocked} onClick={() => void run("validateClosing", { termId: selectedTerm.id }, `${selectedTerm.name} closing is validated.`)}><ShieldCheck size={15}/> Validate</button><button className="acw-primary" disabled={busy || selectedTerm.isLocked || selectedTerm.policy?.closingStatus !== "ready"} onClick={() => void run("lockTerm", { termId: selectedTerm.id }, `${selectedTerm.name} is locked and historical.`)}><LockKeyhole size={15}/> Lock term</button></div>
      </>}
    </section>

    <section className="acw-card">
      <div className="acw-head"><div><span className="acw-kicker">04 · YEAR-END REVIEW</span><h2>Confirm class-teacher recommendations before rollover.</h2><p>Teachers submit drafts from My Class. Confirmed decisions become eligible for the existing Year-End Rollover engine; section placement still happens later.</p></div><span className="acw-status">{yearDrafts.length} awaiting review</span></div>
      {!yearDrafts.length ? <div className="acw-empty">No draft class-teacher recommendations for this academic year.</div> : <div className="acw-review-list">{yearDrafts.map((draft) => <article key={draft.id}><div><strong>{draft.studentName}</strong><small>{draft.admissionNo}</small></div><div><span>{draft.outcome.replaceAll("_", " ")}</span><small>{draft.targetGradeName || "No target grade"}{draft.targetPathwayName ? ` · ${draft.targetPathwayName}` : ""}</small>{draft.reason ? <small>Reason: {draft.reason}</small> : null}</div><button className="acw-primary" disabled={busy} onClick={() => void run("confirmPromotion", { decisionId: draft.id }, `${draft.studentName}'s year-end decision was confirmed.`)}>Confirm decision</button></article>)}</div>}
    </section>
  </div>;
}
