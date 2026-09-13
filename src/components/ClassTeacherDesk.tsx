"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, GraduationCap, ShieldCheck, UsersRound } from "lucide-react";

type Policy = { isYearEnd: boolean; closingStatus: string; classTeacherReviewCloseAt: string | null } | null;
type Term = { id: string; name: string; academicYearId: string; academicYearName: string; startDate: string; endDate: string; isLocked: boolean; policy: Policy };
type SchoolClass = { id: string; name: string; level: string | null };
type Decision = { id: string; outcome: string; status: string; reason: string | null; targetGradeName: string | null; targetPathwayName: string | null } | null;
type Learner = {
  studentId: string; name: string; admissionNo: string; guardianName: string | null; guardianPhone: string | null;
  academic: { assessmentCount: number; scoreCount: number; average: number | null; missingScores: number };
  attendance: { present: number; absent: number; late: number };
  reportCard: { status: string; remarks: string | null; headRemark: string | null } | null;
  yearEnrollment: { gradeLevelId: string; gradeName: string; isTerminal: boolean; pathwayRequired: boolean } | null;
  progression: { outcome: string; toGradeLevelId: string | null; targetPathwayId: string | null; targetGradeName: string | null } | null;
  decision: Decision;
  pathways: Array<{ id: string; name: string; code: string }>;
};
type Desk = { classes: SchoolClass[]; terms: Term[]; selectedClass: SchoolClass | null; selectedTerm: Term | null; learners: Learner[]; summary: { learners: number; assessments: number; pendingDecisions: number; draftDecisions: number; confirmedDecisions: number; yearEnd: boolean } | null };
type Draft = { outcome: string; targetPathwayId: string; reason: string };

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message || body?.error || "Request failed.");
  return body;
}

function defaultDraft(learner: Learner): Draft {
  if (learner.decision) return { outcome: learner.decision.outcome, targetPathwayId: "", reason: learner.decision.reason ?? "" };
  if (learner.yearEnrollment?.isTerminal || learner.progression?.outcome === "complete") return { outcome: "graduated", targetPathwayId: "", reason: "" };
  return { outcome: "promoted", targetPathwayId: learner.progression?.targetPathwayId ?? "", reason: "" };
}

export default function ClassTeacherDesk() {
  const [desk, setDesk] = useState<Desk>({ classes: [], terms: [], selectedClass: null, selectedTerm: null, learners: [], summary: null });
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(nextClassId = classId, nextTermId = termId) {
    setError("");
    try {
      const params = new URLSearchParams();
      if (nextClassId) params.set("classId", nextClassId);
      if (nextTermId) params.set("termId", nextTermId);
      const body = await api(`/api/school/class-teacher${params.size ? `?${params}` : ""}`) as Desk;
      setDesk(body);
      const resolvedClass = body.selectedClass?.id ?? body.classes[0]?.id ?? "";
      const resolvedTerm = body.selectedTerm?.id ?? body.terms[0]?.id ?? "";
      setClassId(resolvedClass);
      setTermId(resolvedTerm);
      setDrafts(Object.fromEntries(body.learners.map((learner) => [learner.studentId, defaultDraft(learner)])));
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to load your class."); }
  }

  useEffect(() => { void load("", ""); }, []);
  const yearEnd = Boolean(desk.selectedTerm?.policy?.isYearEnd);
  const reviewClosed = desk.selectedTerm?.policy?.classTeacherReviewCloseAt ? new Date() > new Date(desk.selectedTerm.policy.classTeacherReviewCloseAt) : false;
  const editable = yearEnd && !desk.selectedTerm?.isLocked && !reviewClosed;
  const average = useMemo(() => {
    const values = desk.learners.map((item) => item.academic.average).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }, [desk.learners]);

  function updateDraft(studentId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [studentId]: { ...(current[studentId] ?? { outcome: "promoted", targetPathwayId: "", reason: "" }), ...patch } }));
  }

  async function submit(learner: Learner) {
    if (!desk.selectedClass || !desk.selectedTerm) return;
    const draft = drafts[learner.studentId] ?? defaultDraft(learner);
    setBusy(learner.studentId); setError(""); setNotice("");
    try {
      await api("/api/school/class-teacher", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "promotionRecommendation", classId: desk.selectedClass.id, termId: desk.selectedTerm.id, studentId: learner.studentId, outcome: draft.outcome, targetPathwayId: draft.targetPathwayId || null, reason: draft.reason || null }),
      });
      setNotice(`${learner.name}'s recommendation was submitted for academic review.`);
      await load(desk.selectedClass.id, desk.selectedTerm.id);
    } catch (value) { setError(value instanceof Error ? value.message : "Could not submit recommendation."); }
    finally { setBusy(""); }
  }

  return <div className="ctd-page">
    <section className="ctd-hero">
      <div><span className="ctd-kicker">CLASS TEACHER DESK</span><h1>See the whole class, not just one subject.</h1><p>Attendance, academic coverage, report readiness and year-end recommendations come together here. Subject marks remain owned by their subject teachers.</p></div>
      <div className="ctd-hero-side"><UsersRound size={20}/><strong>{desk.summary?.learners ?? 0}</strong><span>learners in your selected class</span><Link href="/school/teacher-academic">Open subject teaching studio →</Link></div>
    </section>

    {error ? <div className="ctd-alert bad">{error}</div> : null}
    {notice ? <div className="ctd-alert good">{notice}</div> : null}

    {!desk.classes.length ? <section className="ctd-empty"><GraduationCap size={28}/><h2>No class-teacher assignment yet</h2><p>Your account can still use normal teaching tools, but My Class appears after school leadership assigns you as the headteacher/class teacher of a class.</p></section> : <>
      <section className="ctd-context">
        <label>My class<select value={classId} onChange={(event) => { const next = event.target.value; setClassId(next); void load(next, termId); }}>{desk.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
        <label>Academic session<select value={termId} onChange={(event) => { const next = event.target.value; setTermId(next); void load(classId, next); }}>{desk.terms.map((item) => <option key={item.id} value={item.id}>{item.academicYearName} · {item.name}{item.policy?.isYearEnd ? " · year-end" : ""}{item.isLocked ? " · locked" : ""}</option>)}</select></label>
        <div className="ctd-context-note"><ShieldCheck size={17}/><div><strong>{yearEnd ? "Year-end session" : "Normal session"}</strong><span>{yearEnd ? "Promotion recommendations are available; academic leadership still confirms them before rollover." : "Promotion controls stay hidden outside the configured year-end session."}</span></div></div>
      </section>

      <section className="ctd-stats">
        <div><span>Class average</span><strong>{average == null ? "—" : `${average.toFixed(1)}%`}</strong></div>
        <div><span>Assessments</span><strong>{desk.summary?.assessments ?? 0}</strong></div>
        <div><span>Draft recommendations</span><strong>{desk.summary?.draftDecisions ?? 0}</strong></div>
        <div><span>Confirmed decisions</span><strong>{desk.summary?.confirmedDecisions ?? 0}</strong></div>
      </section>

      {yearEnd ? <section className="ctd-year-end"><div><span className="ctd-kicker">YEAR-END</span><h2>Class teacher recommendations</h2><p>You recommend the academic outcome. You do not choose the final A/B/C section; placement is handled by Year-End Rollover after leadership confirms the decision.</p></div><div className="ctd-year-end-count"><strong>{desk.summary?.pendingDecisions ?? 0}</strong><span>without a recommendation</span></div></section> : null}

      <section className="ctd-table-wrap"><table className="ctd-table"><thead><tr><th>Learner</th><th>Academics</th><th>Attendance</th><th>Report</th><th>Guardian</th>{yearEnd ? <th>Year-end recommendation</th> : null}</tr></thead><tbody>{desk.learners.map((learner) => {
        const draft = drafts[learner.studentId] ?? defaultDraft(learner);
        const needsReason = ["retained","deferred","transferred","withdrawn"].includes(draft.outcome);
        return <tr key={learner.studentId}>
          <td><strong>{learner.name}</strong><small>{learner.admissionNo}</small>{learner.yearEnrollment ? <small>{learner.yearEnrollment.gradeName}</small> : <small className="ctd-warn">Academic structure not mapped</small>}</td>
          <td><strong>{learner.academic.average == null ? "—" : `${learner.academic.average.toFixed(1)}%`}</strong><small>{learner.academic.scoreCount}/{learner.academic.assessmentCount} score records</small>{learner.academic.missingScores ? <small className="ctd-warn">{learner.academic.missingScores} missing</small> : <small className="ctd-ok">Complete</small>}</td>
          <td><strong>{learner.attendance.present} present</strong><small>{learner.attendance.absent} absent · {learner.attendance.late} late</small></td>
          <td>{learner.reportCard ? <><strong>{learner.reportCard.status}</strong><small>{learner.reportCard.remarks ? "Class remark added" : "Class remark pending"}</small></> : <><strong>Not generated</strong><small>Report card pending</small></>}</td>
          <td><strong>{learner.guardianName || "—"}</strong><small>{learner.guardianPhone || "No primary phone"}</small></td>
          {yearEnd ? <td><div className="ctd-decision">
            {learner.decision ? <span className={`ctd-pill ${learner.decision.status}`}>{learner.decision.status}</span> : null}
            <select disabled={!editable || busy === learner.studentId || learner.decision?.status === "applied"} value={draft.outcome} onChange={(event) => updateDraft(learner.studentId, { outcome: event.target.value })}><option value="promoted">Promote</option><option value="retained">Retain</option><option value="deferred">Refer for review</option>{learner.yearEnrollment?.isTerminal || learner.progression?.outcome === "complete" ? <option value="graduated">Complete / graduate</option> : null}<option value="transferred">Transfer out</option><option value="withdrawn">Withdraw</option></select>
            {draft.outcome === "promoted" && learner.pathways.length ? <select disabled={!editable} value={draft.targetPathwayId} onChange={(event) => updateDraft(learner.studentId, { targetPathwayId: event.target.value })}><option value="">Pathway if required</option>{learner.pathways.map((pathway) => <option key={pathway.id} value={pathway.id}>{pathway.name}</option>)}</select> : null}
            {needsReason ? <input disabled={!editable} value={draft.reason} onChange={(event) => updateDraft(learner.studentId, { reason: event.target.value })} placeholder="Reason required"/> : null}
            <small>{draft.outcome === "promoted" ? `Target grade: ${learner.progression?.targetGradeName || "not configured"}` : learner.decision?.targetGradeName ? `Target: ${learner.decision.targetGradeName}` : ""}</small>
            <button disabled={!editable || busy === learner.studentId || learner.decision?.status === "applied"} onClick={() => void submit(learner)}>{busy === learner.studentId ? "Submitting…" : learner.decision?.status === "draft" ? "Update recommendation" : learner.decision?.status === "confirmed" ? "Revise recommendation" : "Submit recommendation"}</button>
          </div></td> : null}
        </tr>;
      })}</tbody></table></section>

      <section className="ctd-footnote"><BookOpenCheck size={18}/><div><strong>Oversight does not change mark ownership.</strong><span>Missing marks are shown so the class teacher can follow up, but edits still happen through the assigned subject teacher’s Gradebook/Teacher Academic Studio.</span></div>{yearEnd && desk.summary?.pendingDecisions === 0 ? <CheckCircle2 size={20}/> : null}</section>
    </>}
  </div>;
}
