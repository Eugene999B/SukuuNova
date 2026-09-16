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
import TeacherQuickMarkSheet, { type QuickMarkKind } from "@/components/TeacherQuickMarkSheet";
import "@/app/school/module-workspace.css";
import "@/app/school/academic-workspace.css";
import "@/app/school/gradebook/studio/gradebook-entry.css";
import "../teacher-gradebook.css";

const QUICK_MARK_KINDS: QuickMarkKind[] = ["Classwork", "Homework", "Exercise", "Quiz", "Exam"];
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
  searchParams: Promise<{ term?: string; view?: string; assessment?: string; week?: string; kind?: string }>;
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
      `SELECT "assessmentId","title","kind","workDate","weekNumber","workNumber" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "termId"=$2 AND "classId"=$3 AND "subjectId"=$4 AND "assessmentId" IS NOT NULL ORDER BY "weekNumber" DESC,"workDate" DESC,"workNumber" DESC`,
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
  const addWorkFragment = "#" + "add-work";
  const workByAssessment = new Map(data.workRows.map((row) => [row.assessmentId, row]));
  const selectedAssessment = data.performance?.assessments.find((assessment) => assessment.id === query.assessment) ?? null;
  const selectedWork = selectedAssessment ? workByAssessment.get(selectedAssessment.id) : undefined;
  const selectedScoreRows = selectedAssessment && data.performance ? data.performance.rows.map((row) => ({
    student: row.student,
    expected: row.scores.find((score) => score.assessmentId === selectedAssessment.id)?.expected ?? null,
  })) : [];

  const assessmentRows = data.performance?.assessments.map((assessment) => {
    const work = workByAssessment.get(assessment.id);
    const recorded = data.performance?.rows.filter((row) => row.scores.find((score) => score.assessmentId === assessment.id)?.expected).length ?? 0;
    return {
      ...assessment,
      title: work ? `${work.kind} ${work.workNumber}` : cleanAssessmentName(assessment.name),
      work,
      recorded,
    };
  }) ?? [];
  const currentWorkRows = assessmentRows.filter((assessment) => Boolean(assessment.work));
  const earlierRecordedRows = assessmentRows.filter((assessment) => !assessment.work);
  const weekNumbers = Array.from(new Set(currentWorkRows.map((assessment) => assessment.work!.weekNumber))).sort((a, b) => b - a);
  const learnerCount = data.performance?.rows.length ?? 0;
  const requestedWeekNumber = Number(query.week);
  const initialWeek = Number.isInteger(requestedWeekNumber) && requestedWeekNumber >= 1 && requestedWeekNumber <= data.teachingWeeks ? requestedWeekNumber : undefined;
  const initialKind = QUICK_MARK_KINDS.find((kind) => kind.toLowerCase() === query.kind?.toLowerCase());
  const workActionLabel = (recorded: number) => data.readOnly ? "Review marks" : recorded === learnerCount && learnerCount > 0 ? "View / edit marks" : recorded > 0 ? "Continue entering marks" : "Enter marks";

  return <AppShell universe="teacher" title="My gradebook" subtitle="Choose a week, create the work you gave the class, and enter the marks." active="My Gradebook" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role="Teacher">
    <div className="module-workspace teacher-gradebook-redesign">
      <section className="module-card module-setup-card gradebook-context-card">
        <div><span className="module-overline">My gradebook</span><h3>{data.assignment.class.name} · {data.assignment.subject.name}</h3><p>{data.selectedTerm ? `${data.selectedTerm.name} · ${data.readOnly ? "Previous term · view only" : "Current term"}` : "No active academic term"} · {learnerCount} learners</p></div>
        <Link className="button secondary" href="/teacher/gradebook">← My gradebooks</Link>
      </section>

      {data.selectedTerm && data.readOnly ? <section className="module-card"><div className="module-notice"><strong>This is a previous term.</strong><p>You can review the marks, but changes are disabled unless school leadership reopens the term.</p></div></section> : null}

      {!data.selectedTerm || !data.performance ? <section className="module-card module-empty"><strong>No academic term is available.</strong><p>School leadership controls the academic calendar. Your current gradebook appears automatically when a live term is configured.</p></section> : <>
        <section className="gradebook-policy-strip" aria-label="How the final result is calculated">
          <div><span>Classwork, homework, exercises & quizzes</span><strong>{data.weights.ca}%</strong><small>All continuous work combines by total marks earned out of total marks possible.</small></div>
          <div><span>End-of-term exam</span><strong>{data.weights.exam}%</strong><small>The exam contributes this percentage to the learner&apos;s final result.</small></div>
          <div><span>Final result</span><strong>Automatic</strong><small>SukuuNova calculates the total from the school&apos;s approved percentages.</small></div>
        </section>

        <nav className="gradebook-view-tabs" aria-label="Gradebook views">
          <Link className={view === "assessments" ? "is-active" : ""} href={hrefFor("assessments")}>Enter marks</Link>
          <Link className={view === "overview" ? "is-active" : ""} href={hrefFor("overview")}>All marks</Link>
          <Link className={view === "results" ? "is-active" : ""} href={hrefFor("results")}>Results</Link>
        </nav>

        {view === "assessments" ? <section className="module-card gradebook-assessments-panel" id="marks">
          {selectedAssessment ? <>
            <div className="gradebook-focused-heading">
              <div>
                <Link href={hrefFor("assessments")}>← Back to all work</Link>
                <span>{selectedWork ? `Week ${selectedWork.weekNumber}` : "Earlier recorded marks"}</span>
                <h2>{selectedWork ? `${selectedWork.kind} ${selectedWork.workNumber}` : cleanAssessmentName(selectedAssessment.name)}</h2>
                <p>{selectedWork ? `${dateLabel(selectedWork.workDate)} · ` : ""}Out of {selectedAssessment.maxScore}</p>
              </div>
              {!data.readOnly && selectedWork ? <Link className="button secondary" href={`${hrefFor("assessments")}&week=${selectedWork.weekNumber}&kind=${encodeURIComponent(selectedWork.kind)}${addWorkFragment}`}>+ Add another {selectedWork.kind}</Link> : null}
            </div>
            <TeacherAssessmentMarkSheet key={selectedAssessment.id} assessment={{ id: selectedAssessment.id, name: selectedWork ? `${selectedWork.kind} ${selectedWork.workNumber}` : cleanAssessmentName(selectedAssessment.name), type: selectedAssessment.type, maxScore: selectedAssessment.maxScore }} rows={selectedScoreRows} locked={data.readOnly || data.selectedTerm.isLocked} />
          </> : <>
            <div className="gradebook-section-heading"><div><span>Enter marks</span><h2>Choose the week and the work you gave the class</h2><p>SukuuNova automatically numbers repeated work in the same week: Homework 1, Homework 2, Classwork 1, Classwork 2, and so on.</p></div>{!data.readOnly ? <Link href="/teacher/studio#activities" className="button secondary">Online assessment →</Link> : null}</div>
            {!data.readOnly ? <TeacherQuickMarkSheet classId={classId} subjectId={subjectId} termId={data.selectedTerm.id} teachingWeeks={data.teachingWeeks} termStart={data.selectedTerm.startDate.toISOString().slice(0, 10)} termEnd={data.selectedTerm.endDate.toISOString().slice(0, 10)} allowedKinds={QUICK_MARK_KINDS} existingWork={data.workRows.map((work) => ({ kind: work.kind, weekNumber: work.weekNumber, workNumber: work.workNumber }))} initialWeek={initialWeek} initialKind={initialKind} /> : null}

            {currentWorkRows.length ? <div className="gradebook-week-groups">{weekNumbers.map((weekNumber) => {
              const weekWork = currentWorkRows.filter((assessment) => assessment.work?.weekNumber === weekNumber).sort((a, b) => {
                const dateCompare = b.work!.workDate.getTime() - a.work!.workDate.getTime();
                return dateCompare || b.work!.workNumber - a.work!.workNumber;
              });
              return <section className="gradebook-week-group" key={weekNumber}>
                <div className="gradebook-week-heading"><div><span>Week</span><h3>Week {weekNumber}</h3></div>{!data.readOnly ? <Link href={`${hrefFor("assessments")}&week=${weekNumber}${addWorkFragment}`}>+ Add work in Week {weekNumber}</Link> : null}</div>
                <div className="gradebook-assessment-list">{weekWork.map((assessment) => <article className="gradebook-assessment-row" key={assessment.id}>
                  <div className="gradebook-assessment-main"><span>{dateLabel(assessment.work?.workDate)}</span><strong>{assessment.title}</strong><small>Out of {assessment.maxScore}</small></div>
                  <div className="gradebook-assessment-progress"><span>Marks entered</span><strong>{assessment.recorded}/{learnerCount}</strong><small>{assessment.recorded === learnerCount && learnerCount > 0 ? "All learners done" : `${Math.max(0, learnerCount - assessment.recorded)} remaining`}</small></div>
                  <Link className="gradebook-enter-marks" href={`${hrefFor("assessments")}&assessment=${encodeURIComponent(assessment.id)}`}>{workActionLabel(assessment.recorded)} →</Link>
                </article>)}</div>
              </section>;
            })}</div> : <div className="module-empty gradebook-empty-assessments"><strong>No week-by-week work has been created yet.</strong><span>Use the simple form above to create the first mark sheet.</span></div>}

            {earlierRecordedRows.length ? <details className="gradebook-earlier-records">
              <summary><span><strong>Earlier recorded marks</strong><small>{earlierRecordedRows.length} item{earlierRecordedRows.length === 1 ? "" : "s"}</small></span><span>Show</span></summary>
              <p>These marks were already saved in this term before the new week-by-week workflow. They still count in the term result. Open them only when you need to review or correct those existing marks.</p>
              <div className="gradebook-assessment-list">{earlierRecordedRows.map((assessment) => <article className="gradebook-assessment-row" key={assessment.id}>
                <div className="gradebook-assessment-main"><span>Existing term record</span><strong>{assessment.title}</strong><small>Out of {assessment.maxScore}</small></div>
                <div className="gradebook-assessment-progress"><span>Marks entered</span><strong>{assessment.recorded}/{learnerCount}</strong><small>{assessment.recorded === learnerCount && learnerCount > 0 ? "All learners done" : `${Math.max(0, learnerCount - assessment.recorded)} remaining`}</small></div>
                <Link className="gradebook-enter-marks" href={`${hrefFor("assessments")}&assessment=${encodeURIComponent(assessment.id)}`}>{workActionLabel(assessment.recorded)} →</Link>
              </article>)}</div>
            </details> : null}
          </>}
        </section> : null}

        {view === "overview" ? <section className="module-card gradebook-overview-panel">
          <div className="gradebook-section-heading"><div><span>All marks</span><h2>See every piece of work together</h2><p>Use this view only when you want to compare marks across the whole term. For normal entry, use Enter marks.</p></div></div>
          {data.performance.assessments.length ? <GradebookEntryGrid key={`${context}:${data.selectedTerm.id}:${data.performance.assessments.length}`} locked={data.readOnly || data.selectedTerm.isLocked} assessments={data.performance.assessments} gradeScale={data.gradeScale} rules={{ categories: data.performance.config.categories, rounding: data.performance.config.rounding, missingScorePolicy: data.performance.config.missingScorePolicy, caWeight: data.performance.config.caWeight, examWeight: data.performance.config.examWeight }} rows={data.performance.rows.map((row) => ({ student: row.student, total: row.total, scores: row.scores.map((score) => ({ assessmentId: score.assessmentId, expected: score.expected, rawScore: score.rawScore, maxScore: score.maxScore, status: score.status })) }))} /> : <div className="module-empty"><strong>No marks yet.</strong><span>Create work from Enter marks first.</span></div>}
        </section> : null}

        {view === "results" ? <section className="module-card gradebook-results-panel">
          <div className="gradebook-section-heading"><div><span>Results</span><h2>How each learner&apos;s final result is calculated</h2><p>The school&apos;s continuous-assessment percentage and exam percentage are applied automatically. “Incomplete” means required marks are still missing.</p></div></div>
          <div className="gradebook-results-table-wrap"><table className="gradebook-results-table"><thead><tr><th>Learner</th><th>Continuous assessment · {data.weights.ca}%</th><th>Exam · {data.weights.exam}%</th><th>Final result</th></tr></thead><tbody>{data.results.map((result) => {
            const band = result.total == null ? null : data.gradeScale.find((candidate) => result.total! >= candidate.min && result.total! <= candidate.max);
            return <tr key={result.student.id}><td><strong>{result.student.name}</strong><small>{result.student.admissionNo}</small></td><td><strong>{result.breakdown.ca.possible ? `${result.breakdown.ca.earned}/${result.breakdown.ca.possible}` : "—"}</strong><span>{result.breakdown.ca.percentage == null ? "No continuous-assessment marks" : `${result.breakdown.ca.percentage.toFixed(2)}% → ${result.breakdown.ca.contribution.toFixed(2)}/${data.weights.ca}`}</span></td><td><strong>{result.breakdown.exam.possible ? `${result.breakdown.exam.earned}/${result.breakdown.exam.possible}` : "—"}</strong><span>{result.breakdown.exam.percentage == null ? "No exam mark" : `${result.breakdown.exam.percentage.toFixed(2)}% → ${result.breakdown.exam.contribution.toFixed(2)}/${data.weights.exam}`}</span></td><td><strong>{result.total == null ? "Incomplete" : `${result.total.toFixed(2)}%`}</strong><span>{result.total == null ? "Required marks are still missing" : band ? `${band.grade}${band.label ? ` · ${band.label}` : ""}` : "Ungraded"}</span></td></tr>;
          })}</tbody></table></div>
        </section> : null}

        <section className="module-card gradebook-term-archive"><div className="module-section-title"><div><span>Previous terms</span><h3>Open marks from an older term</h3></div></div><div className="module-actions">{data.terms.filter((term) => term.id !== data.selectedTerm?.id).slice(0, 8).map((term) => <Link key={term.id} className="button secondary" href={`${contextPath}?term=${encodeURIComponent(term.id)}&view=assessments`}>{term.name}{term.isLocked ? " · locked" : ""}</Link>)}</div></section>
      </>}
    </div>
  </AppShell>;
}
