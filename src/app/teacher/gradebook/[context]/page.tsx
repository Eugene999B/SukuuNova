import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { getGradebookConfiguration, getClassSubjectPerformance } from "@/lib/academic-engine";
import { assessmentBucket, assessmentBucketWeights, calculateSubjectResult } from "@/lib/assessment-engine";
import { selectAcademicTerm, termLifecycle } from "@/lib/term-date";
import { gradeScale } from "@/lib/report-card-ranking";
import { DEFAULT_TEACHING_WEEKS, getTeachingWeekMap } from "@/lib/term-teaching-weeks";
import GradebookEntryGrid from "@/components/GradebookEntryGrid";
import TeacherAssessmentMarkSheet from "@/components/TeacherAssessmentMarkSheet";
import TeacherQuickMarkSheet, { type QuickMarkKind } from "@/components/TeacherQuickMarkSheet";
import "@/app/school/module-workspace.css";
import "@/app/school/academic-workspace.css";
import "@/app/school/gradebook/studio/gradebook-entry.css";
import "../teacher-gradebook.css";

const QUICK_MARK_KINDS: QuickMarkKind[] = ["Classwork", "Homework", "Exercise", "Participation", "Quiz", "Exam"];
type WorkMeta = { assessmentId: string; title: string; kind: string; workDate: Date; weekNumber: number; workNumber: number };

function cleanAssessmentName(name: string) {
  return name.replace(/\s+\[[^\]]+\]$/, "");
}

function dateLabel(value: Date | undefined) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

export default async function TeacherGradebookContextPage({ params, searchParams }: {
  params: Promise<{ context: string }>;
  searchParams: Promise<{ term?: string; view?: string; assessment?: string }>;
}) {
  const session = await requireSchoolSession();
  const [{ context }, query] = await Promise.all([params, searchParams]);
  const parts = context.split("__");
  if (parts.length !== 2 || !parts[0] || !parts[1]) notFound();
  const [classId, subjectId] = parts;

  const data = await withTenant(session.schoolId, async (tx) => {
    const [canAssigned, canAll] = await Promise.all([
      hasPermission(tx, session.userId, "scores:write:assigned"),
      hasPermission(tx, session.userId, "scores:write:all"),
    ]);
    if (!canAssigned && !canAll) throw new Error("You do not have gradebook access.");
    const [school, config, settings, weekMap] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getGradebookConfiguration(tx),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true, gradingScale: true } }),
      getTeachingWeekMap(tx, session.schoolId),
    ]);
    const assignment = config.assignments.find((item) => item.classId === classId && item.subjectId === subjectId && (canAll || item.teacherId === session.userId));
    if (!assignment) throw new Error("This class-subject gradebook is not assigned to you.");
    const timezone = settings?.timezone || "Africa/Accra";
    const activeTerm = selectAcademicTerm(config.terms, undefined, new Date(), timezone);
    const selectedTerm = query.term ? selectAcademicTerm(config.terms, query.term, new Date(), timezone) : activeTerm;
    const lifecycle = selectedTerm ? termLifecycle(selectedTerm, new Date(), timezone) : null;
    const readOnly = !selectedTerm || selectedTerm.id !== activeTerm?.id || lifecycle?.state !== "active";
    const performance = selectedTerm ? await getClassSubjectPerformance(tx, classId, subjectId, selectedTerm.id) : null;
    const workRows = selectedTerm ? await tx.$queryRawUnsafe<WorkMeta[]>(
      `SELECT "assessmentId","title","kind","workDate","weekNumber","workNumber" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "termId"=$2 AND "classId"=$3 AND "subjectId"=$4 AND "assessmentId" IS NOT NULL ORDER BY "workDate" DESC,"weekNumber" DESC,"workNumber" DESC`,
      session.schoolId, selectedTerm.id, classId, subjectId,
    ) : [];
    const teachingWeeks = selectedTerm ? (weekMap.get(selectedTerm.id) ?? DEFAULT_TEACHING_WEEKS) : DEFAULT_TEACHING_WEEKS;
    const scale = gradeScale(settings?.gradingScale);
    const results = performance ? performance.rows.map((row) => {
      const result = calculateSubjectResult(row.scores.map((score) => ({
        id: score.assessmentId,
        name: score.name,
        type: score.type,
        maxScore: score.maxScore,
        weight: score.weight,
        score: score.rawScore,
        status: score.status,
      })), performance.config);
      return { student: row.student, ...result };
    }) : [];
    return {
      school,
      assignment,
      selectedTerm,
      activeTerm,
      lifecycle,
      performance,
      workRows,
      readOnly,
      terms: config.terms,
      gradeScale: scale,
      teachingWeeks,
      results,
      weights: performance ? assessmentBucketWeights(performance.config) : { ca: 0, exam: 0 },
    };
  });

  const contextPath = "/teacher/gradebook/" + encodeURIComponent(classId) + "__" + encodeURIComponent(subjectId);
  const view = query.view === "overview" || query.view === "results" ? query.view : "assessments";
  const termParam = data.selectedTerm?.id ?? "";
  const hrefFor = (nextView: "assessments" | "overview" | "results") => `${contextPath}?term=${encodeURIComponent(termParam)}&view=${nextView}`;
  const workByAssessment = new Map(data.workRows.map((row) => [row.assessmentId, row]));
  const selectedAssessment = data.performance?.assessments.find((assessment) => assessment.id === query.assessment) ?? null;
  const selectedScoreRows = selectedAssessment && data.performance ? data.performance.rows.map((row) => ({
    student: row.student,
    expected: row.scores.find((score) => score.assessmentId === selectedAssessment.id)?.expected ?? null,
  })) : [];

  const assessmentRows = data.performance?.assessments.map((assessment) => {
    const work = workByAssessment.get(assessment.id);
    const recorded = data.performance?.rows.filter((row) => row.scores.find((score) => score.assessmentId === assessment.id)?.expected).length ?? 0;
    return {
      ...assessment,
      title: work?.title || cleanAssessmentName(assessment.name),
      work,
      recorded,
      bucket: assessmentBucket(assessment.type),
    };
  }) ?? [];

  return <AppShell universe="teacher" title="My gradebook" subtitle="Create one piece of work, enter its marks, and let SukuuNova calculate the term result." active="My Gradebook" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role="Teacher">
    <div className="module-workspace teacher-gradebook-redesign">
      <section className="module-card module-setup-card gradebook-context-card">
        <div><span className="module-overline">Teacher gradebook</span><h3>{data.assignment.class.name} · {data.assignment.subject.name}</h3><p>{data.selectedTerm ? `${data.selectedTerm.name} · ${data.readOnly ? "Historical / read-only" : "Active term"}` : "No active academic term"} · {data.performance?.rows.length ?? 0} active learners</p></div>
        <Link className="button secondary" href="/teacher/gradebook">← My gradebooks</Link>
      </section>

      {data.selectedTerm && data.readOnly ? <section className="module-card"><div className="module-notice"><strong>This term is read-only.</strong><p>Historical marks remain available for review, but only school leadership can reopen or finalise a term.</p></div></section> : null}

      {!data.selectedTerm || !data.performance ? <section className="module-card module-empty"><strong>No academic term is available.</strong><p>School leadership controls the academic calendar. Your current gradebook appears automatically when a live term is configured.</p></section> : <>
        <section className="gradebook-policy-strip" aria-label="Current grading policy">
          <div><span>Continuous assessment</span><strong>{data.weights.ca}%</strong><small>Homework, classwork, exercises, quizzes, projects and participation combine by total points.</small></div>
          <div><span>End-of-term exam</span><strong>{data.weights.exam}%</strong><small>The exam contribution is applied only after the learner's exam percentage is calculated.</small></div>
          <div><span>Calculation safety</span><strong>Full precision</strong><small>Intermediate values are not rounded. The final report result is rounded once.</small></div>
        </section>

        <nav className="gradebook-view-tabs" aria-label="Gradebook views">
          <Link className={view === "assessments" ? "is-active" : ""} href={hrefFor("assessments")}>Assessments</Link>
          <Link className={view === "overview" ? "is-active" : ""} href={hrefFor("overview")}>Overview</Link>
          <Link className={view === "results" ? "is-active" : ""} href={hrefFor("results")}>Results</Link>
        </nav>

        {view === "assessments" ? <section className="module-card gradebook-assessments-panel" id="marks">
          {selectedAssessment ? <>
            <div className="gradebook-focused-heading">
              <div><Link href={hrefFor("assessments")}>← All assessments</Link><span>{workByAssessment.get(selectedAssessment.id)?.kind || selectedAssessment.type}</span><h2>{workByAssessment.get(selectedAssessment.id)?.title || cleanAssessmentName(selectedAssessment.name)}</h2><p>{workByAssessment.get(selectedAssessment.id) ? `Week ${workByAssessment.get(selectedAssessment.id)?.weekNumber} · ${dateLabel(workByAssessment.get(selectedAssessment.id)?.workDate)} · ` : ""}Out of {selectedAssessment.maxScore}</p></div>
              <div className={`gradebook-bucket-badge is-${assessmentBucket(selectedAssessment.type)}`}>{assessmentBucket(selectedAssessment.type) === "exam" ? `Exam · ${data.weights.exam}%` : `CA · ${data.weights.ca}%`}</div>
            </div>
            <TeacherAssessmentMarkSheet key={selectedAssessment.id} assessment={{ id: selectedAssessment.id, name: cleanAssessmentName(selectedAssessment.name), type: selectedAssessment.type, maxScore: selectedAssessment.maxScore }} rows={selectedScoreRows} locked={data.readOnly || data.selectedTerm.isLocked} />
          </> : <>
            <div className="gradebook-section-heading"><div><span>Assessment-first marking</span><h2>Choose the work you want to mark</h2><p>Each homework, classwork, quiz or exam has its own mark sheet. Create as many pieces of work as you actually give the class.</p></div>{!data.readOnly ? <Link href="/teacher/studio#activities" className="button secondary">Online assessment →</Link> : null}</div>
            {!data.readOnly ? <TeacherQuickMarkSheet classId={classId} subjectId={subjectId} termId={data.selectedTerm.id} teachingWeeks={data.teachingWeeks} termStart={data.selectedTerm.startDate.toISOString().slice(0, 10)} termEnd={data.selectedTerm.endDate.toISOString().slice(0, 10)} allowedKinds={QUICK_MARK_KINDS} /> : null}
            {assessmentRows.length ? <div className="gradebook-assessment-list">{assessmentRows.map((assessment) => <article className="gradebook-assessment-row" key={assessment.id}>
              <div className={`gradebook-assessment-icon is-${assessment.bucket}`}>{assessment.bucket === "exam" ? "EX" : "CA"}</div>
              <div className="gradebook-assessment-main"><span>{assessment.work?.kind || assessment.type}</span><strong>{assessment.title}</strong><small>{assessment.work ? `Week ${assessment.work.weekNumber} · ${dateLabel(assessment.work.workDate)}` : "Imported assessment"}</small></div>
              <div className="gradebook-assessment-max"><span>Out of</span><strong>{assessment.maxScore}</strong></div>
              <div className="gradebook-assessment-progress"><span>Marked</span><strong>{assessment.recorded}/{data.performance.rows.length}</strong><small>{assessment.recorded === data.performance.rows.length ? "Complete" : `${data.performance.rows.length - assessment.recorded} remaining`}</small></div>
              <Link className="gradebook-enter-marks" href={`${hrefFor("assessments")}&assessment=${encodeURIComponent(assessment.id)}`}>{data.readOnly ? "Review marks" : assessment.recorded ? "Continue marking" : "Enter marks"} →</Link>
            </article>)}</div> : <div className="module-empty gradebook-empty-assessments"><strong>No assessments yet.</strong><span>Create the first homework, classwork, exercise, quiz or exam above. You will enter only that work's marks on the next screen.</span></div>}
          </>}
        </section> : null}

        {view === "overview" ? <section className="module-card gradebook-overview-panel">
          <div className="gradebook-section-heading"><div><span>Term overview</span><h2>All work in one place</h2><p>This spreadsheet view is for review and comparison. For normal mark entry, use the Assessments tab.</p></div></div>
          {data.performance.assessments.length ? <GradebookEntryGrid key={`${context}:${data.selectedTerm.id}:${data.performance.assessments.length}`} locked={data.readOnly || data.selectedTerm.isLocked} assessments={data.performance.assessments} gradeScale={data.gradeScale} rules={{ categories: data.performance.config.categories, rounding: data.performance.config.rounding, missingScorePolicy: data.performance.config.missingScorePolicy }} rows={data.performance.rows.map((row) => ({ student: row.student, total: row.total, scores: row.scores.map((score) => ({ assessmentId: score.assessmentId, expected: score.expected, rawScore: score.rawScore, maxScore: score.maxScore, status: score.status })) }))} /> : <div className="module-empty"><strong>No assessments yet.</strong><span>Create work from the Assessments tab first.</span></div>}
        </section> : null}

        {view === "results" ? <section className="module-card gradebook-results-panel">
          <div className="gradebook-section-heading"><div><span>Transparent calculation</span><h2>CA + Exam result breakdown</h2><p>Every result shows the exact earned points, possible points, configured contribution and final total. “Incomplete” means SukuuNova will not publish a misleading partial result.</p></div></div>
          <div className="gradebook-results-table-wrap"><table className="gradebook-results-table"><thead><tr><th>Learner</th><th>Continuous assessment · {data.weights.ca}%</th><th>Exam · {data.weights.exam}%</th><th>Final result</th></tr></thead><tbody>{data.results.map((result) => {
            const band = result.total == null ? null : data.gradeScale.find((candidate) => result.total! >= candidate.min && result.total! <= candidate.max);
            return <tr key={result.student.id}><td><strong>{result.student.name}</strong><small>{result.student.admissionNo}</small></td><td><strong>{result.breakdown.ca.possible ? `${result.breakdown.ca.earned}/${result.breakdown.ca.possible}` : "—"}</strong><span>{result.breakdown.ca.percentage == null ? "No CA evidence" : `${result.breakdown.ca.percentage.toFixed(2)}% → ${result.breakdown.ca.contribution.toFixed(2)}/${data.weights.ca}`}</span></td><td><strong>{result.breakdown.exam.possible ? `${result.breakdown.exam.earned}/${result.breakdown.exam.possible}` : "—"}</strong><span>{result.breakdown.exam.percentage == null ? "No exam evidence" : `${result.breakdown.exam.percentage.toFixed(2)}% → ${result.breakdown.exam.contribution.toFixed(2)}/${data.weights.exam}`}</span></td><td><strong>{result.total == null ? "Incomplete" : `${result.total.toFixed(2)}%`}</strong><span>{result.total == null ? "Missing required marks" : band ? `${band.grade}${band.label ? ` · ${band.label}` : ""}` : "Ungraded"}</span></td></tr>;
          })}</tbody></table></div>
        </section> : null}

        <section className="module-card gradebook-term-archive"><div className="module-section-title"><div><span>Term archive</span><h3>Open a previous term read-only</h3></div></div><div className="module-actions">{data.terms.filter((term) => term.id !== data.selectedTerm?.id).slice(0, 8).map((term) => <Link key={term.id} className="button secondary" href={`${contextPath}?term=${encodeURIComponent(term.id)}&view=assessments`}>{term.name}{term.isLocked ? " · locked" : ""}</Link>)}</div></section>
      </>}
    </div>
  </AppShell>;
}
