"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Policy = { isYearEnd: boolean; closingStatus: string; classTeacherReviewCloseAt: string | null } | null;
type ClassRow = { id: string; name: string; level: string | null; scopeSource?: "annual_class_section" | "legacy_class" };
type TermRow = { id: string; name: string; academicYearId: string; academicYearName: string; startDate: string; endDate: string; isLocked: boolean; policy: Policy };
type Trait = { fieldKey: string; label: string; value: string; displayOrder: number };
type Decision = { id: string; outcome: string; status: string; reason: string | null; targetGradeName: string | null; targetPathwayName: string | null } | null;
type Learner = {
  studentId: string;
  name: string;
  admissionNo: string;
  guardianName: string | null;
  guardianPhone: string | null;
  academic: { assessmentCount: number; scoreCount: number; average: number | null; missingScores: number };
  attendance: { present: number; absent: number; late: number };
  reportCard: { id: string; status: string; remarks: string | null; headRemark: string | null; traits: Trait[] } | null;
  yearEnrollment: { gradeName: string; isTerminal: boolean } | null;
  progression: { outcome: "advance" | "complete" | "exit"; targetGradeName: string | null } | null;
  decision: Decision;
  pathways: Array<{ id: string; name: string; code: string }>;
};
type DeskData = {
  classes: ClassRow[];
  terms: TermRow[];
  selectedClass: ClassRow | null;
  selectedTerm: TermRow | null;
  learners: Learner[];
  traitFields: string[];
  summary: { learners: number; assessments: number; pendingDecisions: number; draftDecisions: number; confirmedDecisions: number; yearEnd: boolean } | null;
};

const pct = (value: number | null) => value == null ? "—" : `${Math.round(value * 10) / 10}%`;

export default function ClassTeacherDesk() {
  const [data, setData] = useState<DeskData | null>(null);
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (nextClassId = classId, nextTermId = termId) => {
    setBusy(true);
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (nextClassId) params.set("classId", nextClassId);
      if (nextTermId) params.set("termId", nextTermId);
      const response = await fetch(`/api/school/class-teacher?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Unable to load My Class.");
      setData(payload);
      setClassId(payload.selectedClass?.id ?? "");
      setTermId(payload.selectedTerm?.id ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load My Class.");
    } finally { setBusy(false); }
  }, [classId, termId]);

  useEffect(() => { void load("", ""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openTerm = (value: string) => { setTermId(value); void load("", value); };
  const openClass = (value: string) => { setClassId(value); void load(value, termId); };
  const selectedTerm = data?.selectedTerm;
  const selectedClass = data?.selectedClass;

  return (
    <main className="ctd-page">
      <style>{styles}</style>
      <header className="ctd-hero">
        <div>
          <span className="ctd-kicker">MY CLASS · WHOLE-LEARNER OVERSIGHT</span>
          <h1>Class Teacher Desk</h1>
          <p>Review class readiness, attendance and reports; write each learner&apos;s official remark and traits; and submit year-end progression recommendations.</p>
        </div>
        <div className="ctd-hero-actions">
          <Link href="/school/teacher-academic">Teacher Academic Studio</Link>
          <Link href="/account/signature">My signature</Link>
        </div>
      </header>

      <section className="ctd-picker">
        <label><span>Academic session</span><select value={termId} onChange={(event) => openTerm(event.target.value)} disabled={busy}>{data?.terms.map((term) => <option key={term.id} value={term.id}>{term.academicYearName} · {term.name}{term.policy?.isYearEnd ? " · YEAR END" : ""}</option>)}</select></label>
        <label><span>My class</span><select value={classId} onChange={(event) => openClass(event.target.value)} disabled={busy || !selectedTerm}>{data?.classes.map((row) => <option key={row.id} value={row.id}>{row.level ? `${row.level} · ` : ""}{row.name}</option>)}</select></label>
        <div className="ctd-context"><small>Responsibility</small><strong>{selectedClass?.scopeSource === "annual_class_section" ? "Academic-year assignment" : "Legacy class assignment"}</strong><span>{selectedTerm?.isLocked ? "Session locked" : selectedTerm?.policy?.closingStatus ?? "Open"}</span></div>
      </section>

      {message ? <div className="ctd-message" role="status">{message}</div> : null}
      {!data && busy ? <div className="ctd-empty">Loading your class workspace…</div> : null}
      {data && !data.classes.length ? <div className="ctd-empty"><strong>No class-teacher assignment is active for this academic year.</strong><span>Ask an administrator to assign you as the class teacher for a mapped class section.</span></div> : null}

      {data?.summary ? <Summary data={data.summary} /> : null}

      {data?.learners.length ? (
        <section className="ctd-roster">
          <div className="ctd-section-head">
            <div><span className="ctd-kicker">CLASS REGISTER</span><h2>{selectedClass?.name} · {selectedTerm?.name}</h2></div>
            <div className="ctd-legend"><span>Academic</span><span>Attendance</span><span>Report</span><span>{data.summary?.yearEnd ? "Year-end" : "Progress"}</span></div>
          </div>
          <div className="ctd-table-wrap">
            <table>
              <thead><tr><th>Learner</th><th>Academic readiness</th><th>Attendance</th><th>Report preparation</th><th>{data.summary?.yearEnd ? "Progression" : "Status"}</th></tr></thead>
              <tbody>{data.learners.map((learner) => (
                <LearnerRow
                  key={learner.studentId}
                  learner={learner}
                  classId={selectedClass?.id ?? ""}
                  termId={selectedTerm?.id ?? ""}
                  locked={Boolean(selectedTerm?.isLocked)}
                  yearEnd={Boolean(data.summary?.yearEnd)}
                  traitFields={data.traitFields}
                  onChanged={() => void load(selectedClass?.id ?? "", selectedTerm?.id ?? "")}
                  setMessage={setMessage}
                />
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : data?.classes.length ? <div className="ctd-empty"><strong>No learners are enrolled in this class for the selected session.</strong></div> : null}
    </main>
  );
}

function Summary({ data }: { data: NonNullable<DeskData["summary"]> }) {
  const cards = [
    ["Learners", data.learners, "On this term register"],
    ["Assessments", data.assessments, "Expected score entries per learner"],
    [data.yearEnd ? "Pending decisions" : "Year-end decisions", data.yearEnd ? data.pendingDecisions : "—", data.yearEnd ? "Need class-teacher review" : "Available only in the configured final session"],
    ["Confirmed", data.confirmedDecisions, data.yearEnd ? `${data.draftDecisions} draft recommendation${data.draftDecisions === 1 ? "" : "s"}` : "Rollover decisions"],
  ];
  return <section className="ctd-summary">{cards.map(([label, value, note]) => <div key={String(label)}><small>{label}</small><strong>{value}</strong><span>{note}</span></div>)}</section>;
}

function LearnerRow({ learner, classId, termId, locked, yearEnd, traitFields, onChanged, setMessage }: {
  learner: Learner; classId: string; termId: string; locked: boolean; yearEnd: boolean; traitFields: string[]; onChanged: () => void; setMessage: (value: string) => void;
}) {
  const scoreReady = learner.academic.missingScores === 0 && learner.academic.assessmentCount > 0;
  const reportReady = Boolean(learner.reportCard && learner.reportCard.remarks?.trim());
  return (
    <tr>
      <td className="learner-cell"><strong>{learner.name}</strong><span>{learner.admissionNo}</span><small>{learner.yearEnrollment?.gradeName ?? "Grade mapping pending"}</small>{learner.guardianName ? <em>{learner.guardianName}{learner.guardianPhone ? ` · ${learner.guardianPhone}` : ""}</em> : null}</td>
      <td><Metric good={scoreReady} title={pct(learner.academic.average)} note={scoreReady ? "Scores complete" : `${learner.academic.missingScores} score${learner.academic.missingScores === 1 ? "" : "s"} missing`} /></td>
      <td><Metric good={learner.attendance.absent === 0} title={`${learner.attendance.present} present`} note={`${learner.attendance.absent} absent · ${learner.attendance.late} late`} /></td>
      <td>{learner.reportCard ? <ReportPreparation learner={learner} classId={classId} termId={termId} locked={locked} traitFields={traitFields} onChanged={onChanged} setMessage={setMessage} /> : <div className="ctd-stack"><span className="ctd-pill warn">Not generated</span><Link href={`/school/report-cards?term=${encodeURIComponent(termId)}&classId=${encodeURIComponent(classId)}`}>Open report cards</Link></div>}</td>
      <td>{yearEnd ? <PromotionEditor learner={learner} classId={classId} termId={termId} locked={locked} onChanged={onChanged} setMessage={setMessage} /> : <Metric good={reportReady} title={learner.reportCard?.status ?? "No report"} note={reportReady ? "Teacher remark ready" : "Continue report preparation"} />}</td>
    </tr>
  );
}

function Metric({ good, title, note }: { good: boolean; title: string; note: string }) {
  return <div className="ctd-metric"><strong>{title}</strong><span className={`ctd-pill ${good ? "good" : "warn"}`}>{good ? "Ready" : "Attention"}</span><small>{note}</small></div>;
}

function ReportPreparation({ learner, classId, termId, locked, traitFields, onChanged, setMessage }: {
  learner: Learner; classId: string; termId: string; locked: boolean; traitFields: string[]; onChanged: () => void; setMessage: (value: string) => void;
}) {
  const report = learner.reportCard!;
  const existing = useMemo(() => new Map(report.traits.map((item) => [item.label, item.value])), [report.traits]);
  const [remark, setRemark] = useState(report.remarks ?? "");
  const [traits, setTraits] = useState<Record<string, string>>(() => Object.fromEntries(traitFields.map((field) => [field, existing.get(field) ?? ""])));
  const [busy, setBusy] = useState(false);
  const editable = report.status === "draft" && !locked;
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/school/class-teacher", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        action: "reportPreparation", classId, termId, studentId: learner.studentId, remarks: remark,
        traits: traitFields.map((label, index) => ({ fieldKey: label, label, value: traits[label] ?? "", displayOrder: index })),
      }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Unable to save report preparation.");
      setMessage(`Saved ${learner.name}'s class-teacher report section.`); onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save report preparation."); }
    finally { setBusy(false); }
  };
  return <details className="ctd-details"><summary><span className={`ctd-pill ${report.remarks?.trim() ? "good" : "warn"}`}>{report.remarks?.trim() ? "Remark ready" : "Prepare report"}</span><small>{report.status}</small></summary><div className="ctd-prep"><label><span>Class teacher&apos;s remark</span><textarea value={remark} maxLength={800} disabled={!editable || busy} onChange={(event) => setRemark(event.target.value)} placeholder="Write a specific, professional remark about this learner's progress, effort and next steps." /></label>{traitFields.length ? <div className="ctd-traits">{traitFields.map((field) => <label key={field}><span>{field}</span><input value={traits[field] ?? ""} disabled={!editable || busy} onChange={(event) => setTraits((current) => ({ ...current, [field]: event.target.value }))} placeholder="e.g. Respectful" /></label>)}</div> : <p className="ctd-hint">Behaviour/learner traits can be configured in Academic Reporting settings.</p>}<div className="ctd-prep-actions"><Link href={`/school/report-cards/${report.id}/remarks`}>Open full report</Link><button type="button" onClick={() => void save()} disabled={!editable || busy}>{busy ? "Saving…" : "Save remark & traits"}</button></div></div></details>;
}

function PromotionEditor({ learner, classId, termId, locked, onChanged, setMessage }: {
  learner: Learner; classId: string; termId: string; locked: boolean; onChanged: () => void; setMessage: (value: string) => void;
}) {
  const terminal = Boolean(learner.yearEnrollment?.isTerminal);
  const defaultOutcome = learner.decision?.outcome ?? (terminal ? "graduated" : "promoted");
  const [outcome, setOutcome] = useState(defaultOutcome);
  const [reason, setReason] = useState(learner.decision?.reason ?? "");
  const [pathwayId, setPathwayId] = useState("");
  const [busy, setBusy] = useState(false);
  const options = terminal ? [["graduated","Complete / Graduate"],["retained","Retain"],["deferred","Refer for review"],["transferred","Transfer out"],["withdrawn","Withdraw"]] : [["promoted","Promote"],["retained","Retain"],["deferred","Refer for review"],["transferred","Transfer out"],["withdrawn","Withdraw"]];
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/school/class-teacher", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "promotionRecommendation", classId, termId, studentId: learner.studentId, outcome, targetPathwayId: pathwayId || null, reason: reason || null }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Unable to save progression recommendation.");
      setMessage(`Saved ${learner.name}'s year-end recommendation.`); onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save progression recommendation."); }
    finally { setBusy(false); }
  };
  if (learner.decision?.status === "applied") return <div className="ctd-metric"><strong>{labelOutcome(learner.decision.outcome)}</strong><span className="ctd-pill good">Applied</span><small>{learner.decision.targetGradeName ?? learner.decision.targetPathwayName ?? "Year rollover complete"}</small></div>;
  return <details className="ctd-details"><summary><span className={`ctd-pill ${learner.decision ? "good" : "warn"}`}>{learner.decision ? labelOutcome(learner.decision.outcome) : "Decision needed"}</span><small>{learner.decision?.targetGradeName ?? learner.progression?.targetGradeName ?? "Year-end review"}</small></summary><div className="ctd-promotion"><label><span>Recommendation</span><select value={outcome} disabled={locked || busy} onChange={(event) => setOutcome(event.target.value)}>{options.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>{learner.pathways.length ? <label><span>Target pathway / programme</span><select value={pathwayId} disabled={locked || busy} onChange={(event) => setPathwayId(event.target.value)}><option value="">Use default / not required</option>{learner.pathways.map((pathway) => <option key={pathway.id} value={pathway.id}>{pathway.name}</option>)}</select></label> : null}<label><span>Reason / review note</span><textarea value={reason} disabled={locked || busy} onChange={(event) => setReason(event.target.value)} placeholder={outcome === "promoted" || outcome === "graduated" ? "Optional note" : "Required for retention, review, transfer or withdrawal"} /></label><button type="button" onClick={() => void save()} disabled={locked || busy}>{busy ? "Saving…" : "Save year-end recommendation"}</button></div></details>;
}

function labelOutcome(value: string) {
  return ({ promoted: "Promote", retained: "Retain", graduated: "Complete / Graduate", transferred: "Transfer out", withdrawn: "Withdraw", deferred: "Refer for review" } as Record<string,string>)[value] ?? value;
}

const styles = `
.ctd-page{max-width:1380px;margin:0 auto;padding:22px;display:grid;gap:14px;color:var(--color-text-primary)}.ctd-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:22px 24px;border:1px solid var(--color-border);border-radius:22px;background:var(--color-surface)}.ctd-kicker{font-size:9px;font-weight:900;letter-spacing:.15em;color:var(--color-text-muted)}.ctd-hero h1{margin:5px 0;font-size:31px;letter-spacing:-.035em}.ctd-hero p{max-width:820px;margin:0;color:var(--color-text-secondary);font-size:12px;line-height:1.7}.ctd-hero-actions{display:flex;gap:8px;flex-wrap:wrap}.ctd-hero-actions a,.ctd-prep-actions a{border:1px solid var(--color-border);border-radius:10px;padding:9px 11px;text-decoration:none;color:var(--color-text-primary);font-size:10px;font-weight:800}
.ctd-picker{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,1fr) minmax(220px,.8fr);gap:12px;padding:15px;border:1px solid var(--color-border);border-radius:16px;background:var(--color-surface)}.ctd-picker label,.ctd-prep label,.ctd-promotion label,.ctd-traits label{display:grid;gap:5px}.ctd-picker label span,.ctd-prep label span,.ctd-promotion label span,.ctd-traits label span{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.09em;color:var(--color-text-muted)}.ctd-picker select,.ctd-promotion select,.ctd-prep textarea,.ctd-promotion textarea,.ctd-traits input{border:1px solid var(--color-border);border-radius:9px;background:var(--color-bg);color:var(--color-text-primary);font:inherit}.ctd-picker select,.ctd-promotion select,.ctd-traits input{height:40px;padding:0 10px}.ctd-prep textarea,.ctd-promotion textarea{min-height:82px;padding:10px;resize:vertical}.ctd-context{border-left:1px solid var(--color-border);padding-left:14px;display:grid;align-content:center;gap:3px}.ctd-context small{font-size:8px;text-transform:uppercase;color:var(--color-text-muted)}.ctd-context strong{font-size:11px}.ctd-context span{font-size:9px;color:var(--color-text-secondary)}
.ctd-message,.ctd-empty{padding:14px 16px;border:1px solid var(--color-border);border-radius:13px;background:var(--color-surface);font-size:11px}.ctd-empty{min-height:120px;display:grid;place-content:center;text-align:center;gap:5px}.ctd-empty span{color:var(--color-text-secondary)}.ctd-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.ctd-summary>div{padding:15px;border:1px solid var(--color-border);border-radius:15px;background:var(--color-surface);display:grid;gap:4px}.ctd-summary small{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-muted)}.ctd-summary strong{font-size:24px}.ctd-summary span{font-size:9px;color:var(--color-text-secondary)}
.ctd-roster{border:1px solid var(--color-border);border-radius:19px;background:var(--color-surface);overflow:hidden}.ctd-section-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:16px 18px;border-bottom:1px solid var(--color-border)}.ctd-section-head h2{margin:4px 0 0;font-size:17px}.ctd-legend{display:flex;gap:7px;flex-wrap:wrap}.ctd-legend span{font-size:8px;border:1px solid var(--color-border);border-radius:999px;padding:5px 8px;color:var(--color-text-muted)}.ctd-table-wrap{overflow:auto}.ctd-roster table{width:100%;border-collapse:collapse;min-width:1080px}.ctd-roster th{padding:10px 12px;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.1em;color:var(--color-text-muted);background:var(--color-bg);border-bottom:1px solid var(--color-border)}.ctd-roster td{padding:12px;vertical-align:top;border-bottom:1px solid var(--color-border);font-size:10px}.learner-cell{min-width:210px}.learner-cell strong,.learner-cell span,.learner-cell small,.learner-cell em{display:block}.learner-cell strong{font-size:11px}.learner-cell span{margin-top:3px;color:var(--color-text-secondary)}.learner-cell small{margin-top:5px;font-size:8px;font-weight:800}.learner-cell em{margin-top:7px;font-size:8px;color:var(--color-text-muted);font-style:normal}.ctd-metric{display:grid;gap:5px;min-width:125px}.ctd-metric strong{font-size:10px;text-transform:capitalize}.ctd-metric small{font-size:8px;line-height:1.45;color:var(--color-text-muted)}.ctd-pill{width:max-content;display:inline-flex;border-radius:999px;padding:4px 7px;font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ctd-pill.good{background:color-mix(in srgb,var(--color-success) 14%,transparent);color:var(--color-success)}.ctd-pill.warn{background:color-mix(in srgb,var(--color-warning) 14%,transparent);color:var(--color-warning)}.ctd-stack{display:grid;gap:6px}.ctd-stack a{font-size:9px;font-weight:800;text-decoration:none}
.ctd-details{min-width:170px}.ctd-details summary{cursor:pointer;display:grid;gap:4px;list-style:none}.ctd-details summary::-webkit-details-marker{display:none}.ctd-details summary small{font-size:8px;color:var(--color-text-muted);text-transform:capitalize}.ctd-details[open]{position:relative}.ctd-prep,.ctd-promotion{margin-top:9px;padding:11px;border:1px solid var(--color-border);border-radius:11px;background:var(--color-bg);display:grid;gap:10px;min-width:300px}.ctd-traits{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ctd-prep-actions{display:flex;justify-content:space-between;gap:8px;align-items:center}.ctd-prep-actions button,.ctd-promotion button{border:0;border-radius:9px;padding:9px 11px;background:var(--color-brand);color:white;font-weight:900;font-size:9px;cursor:pointer}.ctd-prep-actions button:disabled,.ctd-promotion button:disabled{opacity:.5;cursor:not-allowed}.ctd-hint{margin:0;color:var(--color-text-muted);font-size:9px;line-height:1.5}
@media(max-width:900px){.ctd-hero{flex-direction:column}.ctd-picker{grid-template-columns:1fr}.ctd-context{border-left:0;border-top:1px solid var(--color-border);padding:10px 0 0}.ctd-summary{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.ctd-page{padding:12px}.ctd-summary{grid-template-columns:1fr}.ctd-hero h1{font-size:25px}}
`;
