import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import GradebookEntryGrid from "@/components/GradebookEntryGrid";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { getGradebookConfiguration, getClassSubjectPerformance } from "@/lib/academic-engine";
import { gradeScale } from "@/lib/report-card-ranking";
import { selectAcademicTerm } from "@/lib/term-date";
import "../../academic-workspace.css";
import "../gradebook-simple.css";
import "./gradebook-entry.css";

type SearchParams = Promise<{ class?: string; subject?: string; term?: string }>;

export default async function GradebookStudioPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSchoolSession();
  const params = await searchParams;

  const data = await withTenant(session.schoolId, async (tx) => {
    const canWriteAssigned = await hasPermission(tx, session.userId, "scores:write:assigned");
    const canWriteAll = await hasPermission(tx, session.userId, "scores:write:all");
    if (!canWriteAssigned && !canWriteAll) throw new Error("You do not have gradebook access.");

    const [school, config, settings] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getGradebookConfiguration(tx),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true, gradingScale: true } }),
    ]);

    const assignments = config.assignments.filter((item) => canWriteAll || item.teacherId === session.userId);
    const selectedClass = params.class || "";
    const selectedSubject = params.subject || "";
    const timezone = settings?.timezone || "Africa/Accra";
    const selectedTerm = selectAcademicTerm(config.terms, params.term, new Date(), timezone);
    const assignment = assignments.find((item) => item.classId === selectedClass && item.subjectId === selectedSubject) ?? null;
    const performance = assignment && selectedTerm
      ? await getClassSubjectPerformance(tx, assignment.classId, assignment.subjectId, selectedTerm.id)
      : null;

    return {
      school,
      config,
      assignments,
      assignment,
      selectedTerm,
      performance,
      gradeScale: gradeScale(settings?.gradingScale),
    };
  });

  const classes = Array.from(new Map(data.assignments.map((item) => [item.classId, item.class])).values())
    .sort((a, b) => `${a.level ?? ""}${a.name}`.localeCompare(`${b.level ?? ""}${b.name}`));
  const subjects = Array.from(new Map(
    data.assignments
      .filter((item) => !params.class || item.classId === params.class)
      .map((item) => [item.subjectId, item.subject]),
  ).values()).sort((a, b) => a.name.localeCompare(b.name));
  const terms = data.config.terms;
  const contextQuery = data.assignment && data.selectedTerm
    ? `?class=${encodeURIComponent(data.assignment.classId)}&subject=${encodeURIComponent(data.assignment.subjectId)}&term=${encodeURIComponent(data.selectedTerm.id)}`
    : "";
  const rows = data.performance?.rows ?? [];
  const marked = rows.reduce(
    (count, row) => count + row.scores.filter((score) => score.rawScore != null || score.status === "excused").length,
    0,
  );
  const totalCells = (data.performance?.assessments.length ?? 0) * rows.length;
  const completion = totalCells ? Math.round(marked / totalCells * 100) : 0;
  const termLabel = data.selectedTerm?.name ?? "Choose a term";
  const classLabel = data.assignment
    ? `${data.assignment.class.level ? `${data.assignment.class.level} · ` : ""}${data.assignment.class.name}`
    : "Choose a class";
  const subjectLabel = data.assignment?.subject.name ?? "Choose a subject";

  return (
    <AppShell
      universe="school"
      title="Enter marks"
      subtitle="Choose the teaching context, then work directly in the mark sheet."
      active="Gradebook"
      schoolName={data.school?.name ?? "School Workspace"}
      schoolCode={data.school?.uniqueCode ?? ""}
      userName={session.name}
    >
      <div className="gb-simple">
        <section className="academic-context-card">
          <div className="gb-section-head">
            <div>
              <h2>Choose class, subject and term</h2>
              <p>Only valid teaching assignments are available.</p>
            </div>
            <Link className="academic-btn-secondary" href="/school/gradebook">Back to gradebook</Link>
          </div>
          <form className="academic-context-form" action="/school/gradebook/studio" method="get">
            <div className="academic-field">
              <label htmlFor="gradebook-class">Class</label>
              <select id="gradebook-class" name="class" defaultValue={params.class ?? ""}>
                <option value="">Choose class</option>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}
              </select>
            </div>
            <div className="academic-field">
              <label htmlFor="gradebook-subject">Subject</label>
              <select id="gradebook-subject" name="subject" defaultValue={params.subject ?? ""}>
                <option value="">Choose subject</option>
                {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="academic-field">
              <label htmlFor="gradebook-term">Term</label>
              <select id="gradebook-term" name="term" defaultValue={data.selectedTerm?.id ?? ""}>
                <option value="">Choose term</option>
                {terms.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isLocked ? " · Locked" : ""}</option>)}
              </select>
            </div>
            <button className="academic-context-submit" type="submit">Open mark sheet</button>
          </form>
        </section>

        {!data.assignment || !data.performance ? (
          <section className="academic-empty">
            <strong>{data.selectedTerm ? "Choose a valid class and subject." : "Choose a term before entering marks."}</strong>
            <p>{data.selectedTerm ? "The class and subject must be connected through the school teaching assignment." : "SukuuNova will not guess when the academic period is ambiguous."}</p>
            <div className="academic-empty-actions">
              <Link href="/school/classes">Class assignments</Link>
              <Link href="/school/exams">Assessments</Link>
              <Link href="/school/terms">Terms</Link>
            </div>
          </section>
        ) : (
          <>
            <section className="gb-context" aria-label="Current mark sheet">
              <div className="gb-context-copy">
                <strong>{subjectLabel} · {classLabel}</strong>
                <span>{termLabel}{data.selectedTerm?.isLocked ? " · Read-only" : ` · ${completion}% complete`}</span>
              </div>
              <span className="gb-role">{rows.length} learner{rows.length === 1 ? "" : "s"}</span>
            </section>

            <section className="academic-work-card gradebook-work-card">
              <div className="gb-section-head">
                <div>
                  <h2 id="gradebook-entry-heading">Mark sheet</h2>
                  <p>{data.performance.assessments.length} assessment{data.performance.assessments.length === 1 ? "" : "s"} · {marked} of {totalCells} cells recorded</p>
                </div>
                <Link className="academic-btn-secondary" href={`/school/academics/performance${contextQuery}`}>Review performance</Link>
              </div>

              {data.performance.assessments.length === 0 ? (
                <div className="academic-empty">
                  <strong>No assessments are configured for this term.</strong>
                  <p>Create the assessment structure first, then return to this mark sheet.</p>
                  <div className="academic-empty-actions">
                    <Link href="/school/exams">Configure assessments</Link>
                    <Link href="/school/academics/setup">Grading setup</Link>
                  </div>
                </div>
              ) : (
                <GradebookEntryGrid
                  key={contextQuery}
                  locked={data.selectedTerm?.isLocked ?? true}
                  assessments={data.performance.assessments}
                  rules={{
                    categories: data.config.assessment.categories,
                    rounding: data.config.assessment.rounding,
                    missingScorePolicy: data.config.assessment.missingScorePolicy,
                  }}
                  gradeScale={data.gradeScale}
                  rows={rows.map((row) => ({
                    student: row.student,
                    total: row.total,
                    scores: row.scores.map((score) => ({
                      assessmentId: score.assessmentId,
                      expected: score.expected,
                      rawScore: score.rawScore,
                      maxScore: score.maxScore,
                      status: (score as { status?: string }).status ?? null,
                    })),
                  }))}
                />
              )}
            </section>

            <details className="sn-progressive">
              <summary>Rules, grade bands and next steps</summary>
              <div className="sn-progressive-body">
                <div className="gb-tool-list">
                  <div className="gb-tool-link"><b>Weighting</b><span>{data.config.assessment.categories.map((category) => `${category.name} ${category.weight}%`).join(" · ") || "Not configured"}</span></div>
                  <div className="gb-tool-link"><b>Grade bands</b><span>{data.gradeScale.length ? `${data.gradeScale.length} bands connected` : "No custom scale"}</span></div>
                  <Link className="gb-tool-link" href={`/school/academics/performance${contextQuery}`}><b>Performance</b><span>Review class results →</span></Link>
                  <Link className="gb-tool-link" href="/school/report-cards"><b>Report cards</b><span>Prepare reports →</span></Link>
                  <Link className="gb-tool-link" href="/school/exams"><b>Assessments</b><span>Manage structure →</span></Link>
                  <Link className="gb-tool-link" href="/school/academics/setup"><b>Academic setup</b><span>Grading rules →</span></Link>
                </div>
              </div>
            </details>
          </>
        )}
      </div>
    </AppShell>
  );
}
