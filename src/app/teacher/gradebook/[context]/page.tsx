import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import GradebookEntryGrid from "@/components/GradebookEntryGrid";
import TeacherWeeklyMarkbook from "@/components/TeacherWeeklyMarkbook";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { getGradebookConfiguration, getClassSubjectPerformance } from "@/lib/academic-engine";
import { assessmentBucketWeights, calculateSubjectResult } from "@/lib/assessment-engine";
import { selectAcademicTerm, termLifecycle } from "@/lib/term-date";
import { gradeScale } from "@/lib/report-card-ranking";
import { DEFAULT_TEACHING_WEEKS, getTeachingWeekMap } from "@/lib/term-teaching-weeks";
import "@/app/school/module-workspace.css";
import "@/app/school/academic-workspace.css";
import "@/app/school/gradebook/studio/gradebook-entry.css";
import "../markbook-v3.css";

type WorkMeta = { assessmentId: string; title: string; kind: string; workDate: Date; weekNumber: number; workNumber: number };

export default async function TeacherGradebookContextPage({ params, searchParams }: {
  params: Promise<{ context: string }>;
  searchParams: Promise<{ term?: string; view?: string; week?: string }>;
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

  const contextPath = `/teacher/gradebook/${encodeURIComponent(classId)}__${encodeURIComponent(subjectId)}`;
  const parsedWeek = Number(query.week);
  const selectedWeek = Number.isInteger(parsedWeek) && parsedWeek >= 1 && parsedWeek <= data.teachingWeeks ? parsedWeek : 1;
  const view = query.view === "overview" || query.view === "results" ? query.view : "markbook";
  const termQuery = query.term ? `term=${encodeURIComponent(query.term)}&` : "";
  const viewHref = (nextView: "markbook" | "overview" | "results") => `${contextPath}?${termQuery}week=${selectedWeek}${nextView === "markbook" ? "" : `&view=${nextView}`}`;

  const workByAssessment = new Map(data.workRows.map((row) => [row.assessmentId, row]));
  const assessmentRows = data.performance?.assessments.map((assessment) => {
    const work = workByAssessment.get(assessment.id);
    const recorded = data.performance?.rows.filter((row) => row.scores.find((score) => score.assessmentId === assessment.id)?.expected).length ?? 0;
    return { ...assessment, work, recorded };
  }) ?? [];
  const weekRows = assessmentRows
    .filter((assessment) => assessment.work?.weekNumber === selectedWeek)
    .sort((a, b) => (a.work?.workNumber ?? 0) - (b.work?.workNumber ?? 0));
  const learnerCount = data.performance?.rows.length ?? 0;
  const nextWorkNumber = Math.max(0, ...weekRows.map((row) => row.work?.workNumber ?? 0)) + 1;
  const markbookWorks = weekRows.flatMap((row) => row.work ? [{
    id: row.id,
    workNumber: row.work.workNumber,
    workDate: row.work.workDate.toISOString().slice(0, 10),
    maxScore: row.maxScore,
    recorded: row.recorded,
  }] : []);
  const markbookRows = data.performance?.rows.map((row) => ({
    student: row.student,
    scores: Object.fromEntries(markbookWorks.map((work) => {
      const expected = row.scores.find((score) => score.assessmentId === work.id)?.expected ?? null;
      return [work.id, expected ? { ...expected, enteredAt: new Date(expected.enteredAt).toISOString() } : null];
    })),
  })) ?? [];

  return (
    <AppShell universe="teacher" title="My Gradebook" subtitle="A fast weekly markbook for the classes and subjects assigned to you." active="My Gradebook" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role="Teacher">
      <div className="teacher-markbook-page">
        <section className="markbook-context">
          <div className="markbook-context-main">
            <Link href="/teacher/gradebook" className="markbook-back">← Change class or subject</Link>
            <div>
              <span className="markbook-kicker">OPEN MARKBOOK</span>
              <h2>{data.assignment.class.name}</h2>
              <p>{data.assignment.subject.name} · {learnerCount} learners</p>
            </div>
          </div>
          <div className="markbook-term-chip">
            <span>{data.readOnly ? "HISTORICAL TERM" : "ACTIVE TERM"}</span>
            <strong>{data.selectedTerm?.name ?? "No term"}</strong>
            <small>School academic calendar</small>
          </div>
        </section>

        {!data.selectedTerm || !data.performance ? <section className="markbook-no-term"><strong>No academic term is available.</strong><span>School leadership controls the active term from the academic calendar.</span></section> : <>
          <div className="markbook-topline">
            <nav className="markbook-view-tabs" aria-label="Gradebook views">
              <Link className={view === "markbook" ? "is-active" : ""} href={viewHref("markbook")}>Markbook</Link>
              <Link className={view === "overview" ? "is-active" : ""} href={viewHref("overview")}>Term overview</Link>
              <Link className={view === "results" ? "is-active" : ""} href={viewHref("results")}>Results</Link>
            </nav>
            {data.readOnly ? <span className="markbook-readonly">Read-only</span> : null}
          </div>

          {view === "markbook" ? <section className="markbook-workspace-card">
            <div className="markbook-workspace-head">
              <div><span className="markbook-kicker">WEEKLY MARKS</span><h1>Week {selectedWeek} Markbook</h1><p>Each work is a column. Enter marks like a real mark book and SukuuNova saves every change automatically.</p></div>
              <div className="markbook-work-count"><strong>{markbookWorks.length}</strong><span>work{markbookWorks.length === 1 ? "" : "s"} this week</span></div>
            </div>

            <nav className="markbook-week-strip" aria-label="Choose teaching week">
              {Array.from({ length: data.teachingWeeks }, (_, index) => index + 1).map((weekNumber) => <Link key={weekNumber} className={weekNumber === selectedWeek ? "is-active" : ""} href={`${contextPath}?${termQuery}week=${weekNumber}`}>W{weekNumber}</Link>)}
            </nav>

            <TeacherWeeklyMarkbook
              weekNumber={selectedWeek}
              classId={classId}
              subjectId={subjectId}
              termId={data.selectedTerm.id}
              termStart={data.selectedTerm.startDate.toISOString().slice(0, 10)}
              termEnd={data.selectedTerm.endDate.toISOString().slice(0, 10)}
              nextWorkNumber={nextWorkNumber}
              works={markbookWorks}
              rows={markbookRows}
              locked={data.readOnly || data.selectedTerm.isLocked}
            />
          </section> : null}

          {view === "overview" ? <section className="module-card gradebook-overview-panel">
            <div className="gradebook-section-heading"><div><span>TERM OVERVIEW</span><h2>Review all recorded work</h2><p>This is the whole-term audit view. Everyday entry stays in the weekly Markbook.</p></div></div>
            {data.performance.assessments.length ? <GradebookEntryGrid key={`${context}:${data.selectedTerm.id}:${data.performance.assessments.length}`} locked={data.readOnly || data.selectedTerm.isLocked} assessments={data.performance.assessments} gradeScale={data.gradeScale} rules={{ categories: data.performance.config.categories, rounding: data.performance.config.rounding, missingScorePolicy: data.performance.config.missingScorePolicy, caWeight: data.performance.config.caWeight, examWeight: data.performance.config.examWeight }} rows={data.performance.rows.map((row) => ({ student: row.student, total: row.total, scores: row.scores.map((score) => ({ assessmentId: score.assessmentId, expected: score.expected, rawScore: score.rawScore, maxScore: score.maxScore, status: score.status })) }))} /> : <div className="module-empty"><strong>No marks recorded yet.</strong><span>Open the Markbook and add Work 1.</span></div>}
          </section> : null}

          {view === "results" ? <section className="module-card gradebook-results-panel">
            <div className="gradebook-section-heading"><div><span>TERM RESULTS</span><h2>Calculated result breakdown</h2><p>SukuuNova calculates the configured continuous-assessment and examination contributions from the marks teachers record.</p></div></div>
            <div className="gradebook-results-table-wrap"><table className="gradebook-results-table"><thead><tr><th>Learner</th><th>Continuous assessment · {data.weights.ca}%</th><th>Exam · {data.weights.exam}%</th><th>Final result</th></tr></thead><tbody>{data.results.map((result) => {
              const band = result.total == null ? null : data.gradeScale.find((candidate) => result.total! >= candidate.min && result.total! <= candidate.max);
              return <tr key={result.student.id}><td><strong>{result.student.name}</strong><small>{result.student.admissionNo}</small></td><td><strong>{result.breakdown.ca.possible ? `${result.breakdown.ca.earned}/${result.breakdown.ca.possible}` : "—"}</strong><span>{result.breakdown.ca.percentage == null ? "No CA evidence" : `${result.breakdown.ca.percentage.toFixed(2)}% → ${result.breakdown.ca.contribution.toFixed(2)}/${data.weights.ca}`}</span></td><td><strong>{result.breakdown.exam.possible ? `${result.breakdown.exam.earned}/${result.breakdown.exam.possible}` : "—"}</strong><span>{result.breakdown.exam.percentage == null ? "No exam evidence" : `${result.breakdown.exam.percentage.toFixed(2)}% → ${result.breakdown.exam.contribution.toFixed(2)}/${data.weights.exam}`}</span></td><td><strong>{result.total == null ? "Incomplete" : `${result.total.toFixed(2)}%`}</strong><span>{result.total == null ? "Missing required marks" : band ? `${band.grade}${band.label ? ` · ${band.label}` : ""}` : "Ungraded"}</span></td></tr>;
            })}</tbody></table></div>
          </section> : null}

          {data.terms.some((term) => term.id !== data.selectedTerm?.id) ? <details className="markbook-archive">
            <summary>Previous terms</summary>
            <div>{data.terms.filter((term) => term.id !== data.selectedTerm?.id).slice(0, 8).map((term) => <Link key={term.id} href={`${contextPath}?term=${encodeURIComponent(term.id)}&week=1`}>{term.name}{term.isLocked ? " · locked" : ""}</Link>)}</div>
          </details> : null}
        </>}
      </div>
    </AppShell>
  );
}
