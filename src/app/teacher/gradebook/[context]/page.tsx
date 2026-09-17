import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { getGradebookConfiguration, getClassSubjectPerformance } from "@/lib/academic-engine";
import { assessmentBucketWeights, calculateSubjectResult } from "@/lib/assessment-engine";
import { selectAcademicTerm, termLifecycle } from "@/lib/term-date";
import { gradeScale } from "@/lib/report-card-ranking";
import { DEFAULT_TEACHING_WEEKS, getTeachingWeekMap } from "@/lib/term-teaching-weeks";
import GradebookEntryGrid from "@/components/GradebookEntryGrid";
import TeacherAssessmentMarkSheet from "@/components/TeacherAssessmentMarkSheet";
import TeacherWeeklyWorkSetup from "@/components/TeacherWeeklyWorkSetup";
import "@/app/school/module-workspace.css";
import "@/app/school/academic-workspace.css";
import "@/app/school/gradebook/studio/gradebook-entry.css";
import "../teacher-gradebook.css";
import "../weekly-gradebook.css";

type WorkMeta = { assessmentId: string; title: string; kind: string; workDate: Date; weekNumber: number; workNumber: number };

function dateLabel(value: Date | undefined) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

export default async function TeacherGradebookContextPage({ params, searchParams }: {
  params: Promise<{ context: string }>;
  searchParams: Promise<{ term?: string; view?: string; assessment?: string; week?: string; add?: string }>;
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
      `SELECT "assessmentId","title","kind","workDate","weekNumber","workNumber" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "termId"=$2 AND "classId"=$3 AND "subjectId"=$4 AND "assessmentId" IS NOT NULL ORDER BY "weekNumber" ASC,"workNumber" ASC`,
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
  const view = query.view === "overview" || query.view === "results" ? query.view : "worksheet";
  const parsedWeek = Number(query.week);
  const selectedWeek = Number.isInteger(parsedWeek) && parsedWeek >= 1 && parsedWeek <= data.teachingWeeks ? parsedWeek : 1;
  const termQuery = query.term ? `term=${encodeURIComponent(query.term)}&` : "";
  const hrefFor = (nextView: "worksheet" | "overview" | "results") => `${contextPath}?${termQuery}week=${selectedWeek}${nextView === "worksheet" ? "" : `&view=${nextView}`}`;

  const workByAssessment = new Map(data.workRows.map((row) => [row.assessmentId, row]));
  const assessmentRows = data.performance?.assessments.map((assessment) => {
    const work = workByAssessment.get(assessment.id);
    const recorded = data.performance?.rows.filter((row) => row.scores.find((score) => score.assessmentId === assessment.id)?.expected).length ?? 0;
    return { ...assessment, work, recorded };
  }) ?? [];
  const learnerCount = data.performance?.rows.length ?? 0;
  const weekRows = assessmentRows
    .filter((assessment) => assessment.work?.weekNumber === selectedWeek)
    .sort((a, b) => (a.work?.workNumber ?? 0) - (b.work?.workNumber ?? 0));
  const selectedRow = weekRows.find((assessment) => assessment.id === query.assessment) ?? weekRows[0] ?? null;
  const selectedAssessment = selectedRow ? data.performance?.assessments.find((assessment) => assessment.id === selectedRow.id) ?? null : null;
  const selectedScoreRows = selectedAssessment && data.performance ? data.performance.rows.map((row) => ({
    student: row.student,
    expected: row.scores.find((score) => score.assessmentId === selectedAssessment.id)?.expected ?? null,
  })) : [];
  const addingWork = query.add === "1" || !weekRows.length;
  const nextWorkNumber = Math.max(0, ...weekRows.map((row) => row.work?.workNumber ?? 0)) + 1;

  return <AppShell universe="teacher" title="My Gradebook" subtitle="Weekly worksheets for the classes and subjects assigned to you." active="My Gradebook" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role="Teacher">
    <div className="module-workspace teacher-gradebook-redesign">
      <section className="weekly-context-card">
        <div>
          <span>ASSIGNED GRADEBOOK</span>
          <h2>{data.assignment.class.name} · {data.assignment.subject.name}</h2>
          <p>{data.selectedTerm ? `${data.selectedTerm.name} · ${data.readOnly ? "Read-only history" : "Active term"}` : "No active term"} · {learnerCount} learners</p>
        </div>
        <Link href="/teacher/gradebook">← Change class, subject or week</Link>
      </section>

      {data.selectedTerm && data.readOnly ? <section className="module-card"><div className="module-notice"><strong>This is a previous term.</strong><p>You can review its marks, but the active term is controlled automatically by the school calendar.</p></div></section> : null}

      {!data.selectedTerm || !data.performance ? <section className="module-card module-empty"><strong>No academic term is available.</strong><p>School leadership controls the calendar. A writable worksheet appears automatically when a term is active.</p></section> : <>
        <nav className="weekly-secondary-nav" aria-label="Gradebook views">
          <Link className={view === "worksheet" ? "is-active" : ""} href={hrefFor("worksheet")}>Worksheet</Link>
          <Link className={view === "overview" ? "is-active" : ""} href={hrefFor("overview")}>Term overview</Link>
          <Link className={view === "results" ? "is-active" : ""} href={hrefFor("results")}>Results</Link>
        </nav>

        {view === "worksheet" ? <section className="weekly-sheet" id="marks">
          <div className="weekly-sheet-head">
            <div>
              <span>WEEKLY MARKS</span>
              <h1>Week {selectedWeek} Worksheet</h1>
              <p>Open an existing work to continue where you stopped, or add another work for this same week.</p>
            </div>
            <div className="weekly-work-summary-badge"><strong>{weekRows.length} work{weekRows.length === 1 ? "" : "s"}</strong><small>{learnerCount} learners</small></div>
          </div>

          <div className="weekly-week-switcher" aria-label="Choose teaching week">
            {Array.from({ length: data.teachingWeeks }, (_, index) => index + 1).map((weekNumber) => <Link key={weekNumber} className={weekNumber === selectedWeek ? "is-active" : ""} href={`${contextPath}?${termQuery}week=${weekNumber}`}>Week {weekNumber}</Link>)}
          </div>

          {weekRows.length ? <div className="weekly-work-tabs" aria-label={`Week ${selectedWeek} work`}>
            {weekRows.map((row) => <Link key={row.id} className={!addingWork && selectedRow?.id === row.id ? "is-active" : ""} href={`${contextPath}?${termQuery}week=${selectedWeek}&assessment=${encodeURIComponent(row.id)}`}>Work {row.work?.workNumber}</Link>)}
            {!data.readOnly ? <Link className="weekly-add-work" href={`${contextPath}?${termQuery}week=${selectedWeek}&add=1`}>+ Add another work</Link> : null}
          </div> : null}

          {addingWork && !data.readOnly ? <TeacherWeeklyWorkSetup classId={classId} subjectId={subjectId} termId={data.selectedTerm.id} weekNumber={selectedWeek} nextWorkNumber={nextWorkNumber} termStart={data.selectedTerm.startDate.toISOString().slice(0, 10)} termEnd={data.selectedTerm.endDate.toISOString().slice(0, 10)} /> : null}

          {addingWork && data.readOnly && !weekRows.length ? <div className="weekly-empty-work"><strong>No work was recorded in Week {selectedWeek}.</strong><span>This historical term is read-only, so new work cannot be added.</span></div> : null}

          {!addingWork && selectedAssessment && selectedRow?.work ? <>
            <div className="weekly-work-summary">
              <div><span>WEEK {selectedWeek}</span><h3>Work {selectedRow.work.workNumber}</h3><p>{dateLabel(selectedRow.work.workDate)} · Marks out of {selectedAssessment.maxScore}</p></div>
              <div className="weekly-work-summary-badge"><strong>{selectedRow.recorded}/{learnerCount}</strong><small>marks recorded</small></div>
            </div>
            <TeacherAssessmentMarkSheet key={selectedAssessment.id} assessment={{ id: selectedAssessment.id, name: `Week ${selectedWeek} · Work ${selectedRow.work.workNumber}`, type: "Weekly work", maxScore: selectedAssessment.maxScore }} rows={selectedScoreRows} locked={data.readOnly || data.selectedTerm.isLocked} />
          </> : null}
        </section> : null}

        {view === "overview" ? <section className="module-card gradebook-overview-panel">
          <div className="gradebook-section-heading"><div><span>TERM OVERVIEW</span><h2>Review all recorded work</h2><p>This view is for checking the term as a whole. Normal mark entry stays inside each weekly worksheet.</p></div></div>
          {data.performance.assessments.length ? <GradebookEntryGrid key={`${context}:${data.selectedTerm.id}:${data.performance.assessments.length}`} locked={data.readOnly || data.selectedTerm.isLocked} assessments={data.performance.assessments} gradeScale={data.gradeScale} rules={{ categories: data.performance.config.categories, rounding: data.performance.config.rounding, missingScorePolicy: data.performance.config.missingScorePolicy, caWeight: data.performance.config.caWeight, examWeight: data.performance.config.examWeight }} rows={data.performance.rows.map((row) => ({ student: row.student, total: row.total, scores: row.scores.map((score) => ({ assessmentId: score.assessmentId, expected: score.expected, rawScore: score.rawScore, maxScore: score.maxScore, status: score.status })) }))} /> : <div className="module-empty"><strong>No marks recorded yet.</strong><span>Open a weekly worksheet and create Work 1 first.</span></div>}
        </section> : null}

        {view === "results" ? <section className="module-card gradebook-results-panel">
          <div className="gradebook-section-heading"><div><span>TERM RESULTS</span><h2>Calculated result breakdown</h2><p>SukuuNova continues to calculate configured CA and examination contributions from the recorded evidence.</p></div></div>
          <div className="gradebook-results-table-wrap"><table className="gradebook-results-table"><thead><tr><th>Learner</th><th>Continuous assessment · {data.weights.ca}%</th><th>Exam · {data.weights.exam}%</th><th>Final result</th></tr></thead><tbody>{data.results.map((result) => {
            const band = result.total == null ? null : data.gradeScale.find((candidate) => result.total! >= candidate.min && result.total! <= candidate.max);
            return <tr key={result.student.id}><td><strong>{result.student.name}</strong><small>{result.student.admissionNo}</small></td><td><strong>{result.breakdown.ca.possible ? `${result.breakdown.ca.earned}/${result.breakdown.ca.possible}` : "—"}</strong><span>{result.breakdown.ca.percentage == null ? "No CA evidence" : `${result.breakdown.ca.percentage.toFixed(2)}% → ${result.breakdown.ca.contribution.toFixed(2)}/${data.weights.ca}`}</span></td><td><strong>{result.breakdown.exam.possible ? `${result.breakdown.exam.earned}/${result.breakdown.exam.possible}` : "—"}</strong><span>{result.breakdown.exam.percentage == null ? "No exam evidence" : `${result.breakdown.exam.percentage.toFixed(2)}% → ${result.breakdown.exam.contribution.toFixed(2)}/${data.weights.exam}`}</span></td><td><strong>{result.total == null ? "Incomplete" : `${result.total.toFixed(2)}%`}</strong><span>{result.total == null ? "Missing required marks" : band ? `${band.grade}${band.label ? ` · ${band.label}` : ""}` : "Ungraded"}</span></td></tr>;
          })}</tbody></table></div>
        </section> : null}

        <section className="module-card gradebook-term-archive"><div className="module-section-title"><div><span>Previous terms</span><h3>Review older marks only when you need them</h3></div></div><div className="module-actions">{data.terms.filter((term) => term.id !== data.selectedTerm?.id).slice(0, 8).map((term) => <Link key={term.id} className="button secondary" href={`${contextPath}?term=${encodeURIComponent(term.id)}&week=1`}>{term.name}{term.isLocked ? " · locked" : ""}</Link>)}</div></section>
      </>}
    </div>
  </AppShell>;
}
