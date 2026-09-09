import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { getGradebookConfiguration, getClassSubjectPerformance } from "@/lib/academic-engine";
import { selectAcademicTerm } from "@/lib/term-date";
import { gradeScale } from "@/lib/report-card-ranking";
import GradebookEntryGrid from "@/components/GradebookEntryGrid";
import "@/app/school/module-workspace.css";
import "@/app/school/academic-workspace.css";
import "@/app/school/gradebook/studio/gradebook-entry.css";

export default async function TeacherGradebookContextPage({ params, searchParams }: {
  params: Promise<{ context: string }>; searchParams: Promise<{ term?: string }>;
}) {
  const session = await requireSchoolSession();
  const [{ context }, query] = await Promise.all([params, searchParams]);
  // Next has already decoded the route parameter. A second decode can corrupt valid IDs.
  const parts = context.split("__");
  if (parts.length !== 2 || !parts[0] || !parts[1]) notFound();
  const [classId, subjectId] = parts;
  const data = await withTenant(session.schoolId, async tx => {
    const [canAssigned, canAll] = await Promise.all([
      hasPermission(tx, session.userId, "scores:write:assigned"),
      hasPermission(tx, session.userId, "scores:write:all"),
    ]);
    if (!canAssigned && !canAll) throw new Error("You do not have gradebook access.");
    const [school, config, settings] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getGradebookConfiguration(tx),
      tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { timezone: true, gradingScale: true } }),
    ]);
    const assignment = config.assignments.find(item => item.classId === classId && item.subjectId === subjectId && item.teacherId === session.userId);
    if (!assignment) throw new Error("This class-subject gradebook is not assigned to you.");
    const selectedTerm = selectAcademicTerm(config.terms, query.term, new Date(), settings?.timezone || "Africa/Accra");
    const performance = selectedTerm ? await getClassSubjectPerformance(tx, classId, subjectId, selectedTerm.id) : null;
    return { school, assignment, selectedTerm, performance, terms: config.terms, gradeScale: gradeScale(settings?.gradingScale) };
  });
  const termQuery = data.selectedTerm ? "?term=" + encodeURIComponent(data.selectedTerm.id) : "";
  const contextPath = "/teacher/gradebook/" + encodeURIComponent(classId) + "__" + encodeURIComponent(subjectId);

  return <AppShell universe="teacher" title="My gradebook" subtitle="Enter marks." active="My Gradebook" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role="Teacher">
    <div className="module-workspace">
      <section className="module-card module-setup-card">
        <div><span className="module-overline">Teacher gradebook</span><h3>{data.assignment.class.name} · {data.assignment.subject.name}</h3>
          <p>{data.selectedTerm?.name ?? "Choose a term"}{data.selectedTerm?.isLocked ? " · Locked, read-only" : ""} · {data.performance?.rows.length ?? 0} active learners</p></div>
        <Link className="button secondary" href={"/teacher/gradebook" + termQuery}>← My gradebooks</Link>
      </section>
      <section className="module-card">
        <form className="academic-context-form" action={contextPath} method="get">
          <div className="academic-field"><label htmlFor="teacher-gradebook-term">Academic term</label>
            <select id="teacher-gradebook-term" name="term" defaultValue={data.selectedTerm?.id ?? ""} required>
              <option value="">Choose a term</option>
              {data.terms.map(term => <option key={term.id} value={term.id}>{term.name}{term.isLocked ? " · Locked" : ""}</option>)}
            </select>
          </div>
          <button className="academic-context-submit" type="submit">Open term</button>
        </form>
      </section>
      {!data.selectedTerm || !data.performance ? <section className="module-card module-empty">
        <strong>{query.term ? "The requested term is unavailable." : "Choose an academic term before entering marks."}</strong>
        <p>{data.terms.length ? "Automatic selection requires exactly one active term in the school calendar. Choose a term explicitly to continue." : "Ask an academic administrator to configure the school calendar."}</p>
      </section> : <>
        <section className="module-metrics"><article><span>Learners</span><strong>{data.performance.rows.length}</strong></article><article><span>Assessments</span><strong>{data.performance.assessments.length}</strong></article></section>
        <section className="module-card" id="marks"><div className="module-section-title"><div><span>Focused mark sheet</span><h3>Enter marks</h3></div></div>
          {data.performance.assessments.length === 0 ? <div className="module-empty"><strong>No assessments configured for this term.</strong><span>Ask an academic administrator to configure the assessment structure.</span></div> :
            <GradebookEntryGrid key={context + ":" + data.selectedTerm.id} locked={data.selectedTerm.isLocked}
              assessments={data.performance.assessments} gradeScale={data.gradeScale}
              rules={{ categories: data.performance.config.categories, rounding: data.performance.config.rounding, missingScorePolicy: data.performance.config.missingScorePolicy }}
              rows={data.performance.rows.map(row => ({ student: row.student, total: row.total, scores: row.scores.map(score => ({
                assessmentId: score.assessmentId, expected: score.expected, rawScore: score.rawScore, maxScore: score.maxScore, status: score.status,
              })) }))} />}
        </section>
      </>}
    </div>
  </AppShell>;
}
