"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BookOpenCheck, CheckCircle2, FileText, GraduationCap, LockKeyhole, RefreshCw } from "lucide-react";
import styles from "./TermCompletionControlRoom.module.css";

type TermOption = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isLocked: boolean;
};

type CurriculumIssue = { classId: string; className: string; subjectId: string; subjectName: string };
type Readiness = {
  term: TermOption;
  summary: {
    activeClasses: number;
    activeStudents: number;
    unplacedStudents: number;
    curriculumSubjects: number;
    teachingAssignments: number;
    assessments: number;
    scoredEntries: number;
    excusedEntries: number;
    resolvedScoreEntries: number;
    reportCards: number;
    finalizedReports: number;
    releasedReports: number;
    missingScoreEntries: number;
  };
  blockers: {
    noActiveStudents: boolean;
    classesWithoutCurriculum: Array<{ classId: string; className: string }>;
    unstaffedSubjects: CurriculumIssue[];
    subjectsWithoutAssessments: CurriculumIssue[];
    missingScores: Array<{ classId: string; className: string; count: number }>;
    unplacedStudents: number;
    missingReports: number;
    draftReports: number;
    submittedReports: number;
    approvedAwaitingRelease: number;
    releasedReports: number;
    assessmentWeightTotal: number;
    assessmentWeightsValid: boolean;
  };
  attentionCount: number;
  readyForClose: boolean;
};

const humanDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function IssueRows({ rows }: { rows: string[] }) {
  if (!rows.length) return <span className={styles.clearLine}><CheckCircle2 size={15}/> No issue found.</span>;
  const visible = rows.slice(0, 8);
  return <div className={styles.issueRows}>
    {visible.map((row) => <span key={row}>{row}</span>)}
    {rows.length > visible.length ? <small>+ {rows.length - visible.length} more</small> : null}
  </div>;
}

export function TermCompletionControlRoom({
  terms,
  initialTermId,
  nowIso,
}: {
  terms: TermOption[];
  initialTermId: string;
  nowIso: string;
}) {
  const [selected, setSelected] = useState(initialTermId);
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(Boolean(initialTermId));
  const [error, setError] = useState("");

  const load = useCallback(async (termId: string) => {
    if (!termId) { setData(null); setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/school/academics/term-readiness?termId=${encodeURIComponent(termId)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || body?.error || "Unable to run term readiness.");
      setData(body as Readiness);
    } catch (value) {
      setData(null);
      setError(value instanceof Error ? value.message : "Unable to run term readiness.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selected) void load(selected); }, [load, selected]);

  const term = terms.find((item) => item.id === selected) ?? null;
  const ended = term ? new Date(term.endDate).getTime() < new Date(nowIso).getTime() : false;
  const reportHref = selected ? `/school/report-cards?term=${encodeURIComponent(selected)}` : "/school/report-cards";

  if (!terms.length) {
    return <div className={styles.workspace}>
      <section className={styles.emptyState}>
        <GraduationCap size={34}/>
        <h2>Create an academic term first.</h2>
        <p>Term completion can only inspect a real academic term with its learner roster, curriculum, marks and reports.</p>
        <Link className={styles.primaryLink} href="/school/terms">Open Academic Terms</Link>
      </section>
    </div>;
  }

  return <div className={styles.workspace}>
    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>TERM COMPLETION CONTROL ROOM</span>
        <h2>Finish the term without guessing what is still incomplete.</h2>
        <p>SukuuNova checks the actual term roster, class curriculum, staffing, assessments, score dispositions and report-card workflow before leadership closes the term.</p>
      </div>
      <div className={styles.heroActions}>
        <Link className={styles.secondaryLink} href="/school/terms">Academic Terms</Link>
        <button type="button" className={styles.secondaryButton} onClick={() => selected && void load(selected)} disabled={loading}><RefreshCw size={15}/> Refresh</button>
      </div>
    </section>

    <section className={styles.termPicker}>
      <label>
        <span>Term to review</span>
        <select value={selected} onChange={(event) => setSelected(event.target.value)}>
          {terms.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isLocked ? " · Locked" : ""}</option>)}
        </select>
      </label>
      {term ? <div className={styles.termMeta}>
        <strong>{humanDate(term.startDate)} → {humanDate(term.endDate)}</strong>
        <span>{term.isLocked ? "Locked history" : ended ? "Term has ended" : "Term is still in progress"}</span>
      </div> : null}
    </section>

    {error ? <section className={styles.error}><AlertTriangle size={18}/><div><strong>Readiness could not be loaded.</strong><span>{error}</span></div><button type="button" onClick={() => selected && void load(selected)}>Retry</button></section> : null}
    {loading ? <section className={styles.loading}>Running the readiness checks…</section> : null}

    {!loading && data ? <>
      <section className={`${styles.verdict} ${data.term.isLocked ? styles.locked : data.readyForClose && ended ? styles.ready : styles.attention}`}>
        {data.term.isLocked ? <LockKeyhole size={24}/> : data.readyForClose && ended ? <CheckCircle2 size={24}/> : <AlertTriangle size={24}/>}
        <div>
          <strong>{data.term.isLocked ? "This term is locked." : !ended ? "This term is still in progress." : data.readyForClose ? "The academic record is ready to close." : "Resolve the readiness items before closing the term."}</strong>
          <span>{data.term.isLocked
            ? "The checks below are a historical view. Reopening remains protected by the Academic Terms workflow."
            : !ended
              ? "You can monitor readiness now, but final closure should happen after the term ends."
              : data.readyForClose
                ? "All active learners are placed, curriculum subjects are staffed and assessed, score slots are resolved, report cards are finalized and grading weights total 100%."
                : `${plural(data.attentionCount, "readiness item")} still needs attention. Approved reports waiting for family release do not block locking because release remains independently audited.`}</span>
        </div>
      </section>

      <section className={styles.metrics}>
        <div><span>Active learners</span><strong>{data.summary.activeStudents}</strong><small>{plural(data.summary.activeClasses, "class", "classes")} in this term roster</small></div>
        <div><span>Curriculum</span><strong>{data.summary.curriculumSubjects}</strong><small>{data.summary.teachingAssignments} teacher assignment links</small></div>
        <div><span>Assessments</span><strong>{data.summary.assessments}</strong><small>{data.summary.resolvedScoreEntries} resolved score slots · {data.summary.excusedEntries} excused</small></div>
        <div><span>Report cards</span><strong>{data.summary.finalizedReports}/{data.summary.activeStudents}</strong><small>{data.summary.releasedReports} already released</small></div>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardHead}><BookOpenCheck size={20}/><div><h3>Curriculum & staffing</h3><p>Every active class should have its subjects defined and each subject should have a teacher and at least one term assessment.</p></div></div>
          <div className={styles.checkBlock}>
            <strong>Classes without curriculum <span>{data.blockers.classesWithoutCurriculum.length}</span></strong>
            <IssueRows rows={data.blockers.classesWithoutCurriculum.map((item) => item.className)} />
          </div>
          <div className={styles.checkBlock}>
            <strong>Subjects without a teacher <span>{data.blockers.unstaffedSubjects.length}</span></strong>
            <IssueRows rows={data.blockers.unstaffedSubjects.map((item) => `${item.className} · ${item.subjectName}`)} />
          </div>
          <div className={styles.checkBlock}>
            <strong>Subjects without an assessment <span>{data.blockers.subjectsWithoutAssessments.length}</span></strong>
            <IssueRows rows={data.blockers.subjectsWithoutAssessments.map((item) => `${item.className} · ${item.subjectName}`)} />
          </div>
          <Link className={styles.cardLink} href="/school/classes">Resolve in Classes →</Link>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHead}><GraduationCap size={20}/><div><h3>Marks & learner placement</h3><p>An absent mark can be a zero and an excused mark can be excluded, but every assessment slot needs an explicit disposition.</p></div></div>
          <div className={styles.checkBlock}>
            <strong>Missing score entries <span>{data.blockers.missingScores.reduce((sum, row) => sum + row.count, 0)}</span></strong>
            <IssueRows rows={data.blockers.missingScores.map((item) => `${item.className} · ${plural(item.count, "entry", "entries")}`)} />
          </div>
          <div className={styles.checkBlock}>
            <strong>Unplaced learners <span>{data.blockers.unplacedStudents}</span></strong>
            {data.blockers.unplacedStudents ? <span className={styles.issueText}>{plural(data.blockers.unplacedStudents, "learner")} has no class in the term roster.</span> : <span className={styles.clearLine}><CheckCircle2 size={15}/> Every term learner has a class.</span>}
          </div>
          <div className={styles.note}>Excused scores count as resolved. They are intentionally excluded from averages instead of being misreported as missing marks.</div>
          <Link className={styles.cardLink} href="/school/gradebook">Review Gradebook →</Link>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHead}><FileText size={20}/><div><h3>Report-card workflow</h3><p>Draft and submitted reports still need completion. Approved reports are finalized and may be released to families even after the term is locked.</p></div></div>
          <div className={styles.reportGrid}>
            <span>Not generated<strong>{data.blockers.missingReports}</strong></span>
            <span>Draft<strong>{data.blockers.draftReports}</strong></span>
            <span>For approval<strong>{data.blockers.submittedReports}</strong></span>
            <span>Approved, not released<strong>{data.blockers.approvedAwaitingRelease}</strong></span>
            <span>Released<strong>{data.blockers.releasedReports}</strong></span>
          </div>
          <Link className={styles.cardLink} href={reportHref}>Open Report Cards →</Link>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHead}><CheckCircle2 size={20}/><div><h3>Policy integrity</h3><p>The school assessment categories must form one complete 100% grading policy before result calculations are treated as ready.</p></div></div>
          <div className={styles.weightCheck}>
            <div><span>Configured assessment weight</span><strong>{data.blockers.assessmentWeightTotal}%</strong></div>
            <span className={data.blockers.assessmentWeightsValid ? styles.goodBadge : styles.warningBadge}>{data.blockers.assessmentWeightsValid ? "Valid" : "Needs correction"}</span>
          </div>
          {data.blockers.noActiveStudents ? <div className={styles.note}>No active learner is attached to a class for this term, so the term cannot be considered ready to close.</div> : null}
          <Link className={styles.cardLink} href="/school/academics/setup">Review Academic Setup →</Link>
        </article>
      </section>

      <section className={styles.nextStep}>
        <div>
          <span className={styles.eyebrow}>FINAL STEP</span>
          <h3>{data.readyForClose && ended ? "Ready for leadership closure." : "Keep the term open while the remaining work is resolved."}</h3>
          <p>Term locking stays in Academic Terms so the existing permission checks, audit trail and finalized-report protection remain authoritative.</p>
        </div>
        <Link className={data.readyForClose && ended ? styles.primaryLink : styles.secondaryLink} href="/school/terms">{data.term.isLocked ? "View locked term" : "Open Academic Terms"}</Link>
      </section>
    </> : null}
  </div>;
}
