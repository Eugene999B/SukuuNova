import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { getGradebookConfiguration, getClassSubjectPerformance } from "@/lib/academic-engine";
import { selectAcademicTerm, termLifecycle } from "@/lib/term-date";
import { gradeScale } from "@/lib/report-card-ranking";
import { DEFAULT_TEACHING_WEEKS, getTeachingWeekMap } from "@/lib/term-teaching-weeks";
import GradebookEntryGrid from "@/components/GradebookEntryGrid";
import TeacherQuickMarkSheet from "@/components/TeacherQuickMarkSheet";
import "@/app/school/module-workspace.css";
import "@/app/school/academic-workspace.css";
import "@/app/school/gradebook/studio/gradebook-entry.css";

export default async function TeacherGradebookContextPage({ params, searchParams }: {
  params: Promise<{ context: string }>; searchParams: Promise<{ term?: string }>;
}) {
  const session = await requireSchoolSession();
  const [{ context }, query] = await Promise.all([params, searchParams]);
  const parts = context.split("__");
  if (parts.length !== 2 || !parts[0] || !parts[1]) notFound();
  const [classId, subjectId] = parts;
  const data = await withTenant(session.schoolId, async tx => {
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
    const assignment = config.assignments.find(item => item.classId === classId && item.subjectId === subjectId && (canAll || item.teacherId === session.userId));
    if (!assignment) throw new Error("This class-subject gradebook is not assigned to you.");
    const timezone = settings?.timezone || "Africa/Accra";
    const activeTerm = selectAcademicTerm(config.terms, undefined, new Date(), timezone);
    const selectedTerm = query.term ? selectAcademicTerm(config.terms, query.term, new Date(), timezone) : activeTerm;
    const lifecycle = selectedTerm ? termLifecycle(selectedTerm, new Date(), timezone) : null;
    const readOnly = !selectedTerm || selectedTerm.id !== activeTerm?.id || lifecycle?.state !== "active";
    const performance = selectedTerm ? await getClassSubjectPerformance(tx, classId, subjectId, selectedTerm.id) : null;
    const teachingWeeks = selectedTerm ? (weekMap.get(selectedTerm.id) ?? DEFAULT_TEACHING_WEEKS) : DEFAULT_TEACHING_WEEKS;
    return { school, assignment, selectedTerm, activeTerm, lifecycle, performance, readOnly, terms: config.terms, gradeScale: gradeScale(settings?.gradingScale), teachingWeeks };
  });
  const contextPath = "/teacher/gradebook/" + encodeURIComponent(classId) + "__" + encodeURIComponent(subjectId);

  return <AppShell universe="teacher" title="My gradebook" subtitle="Enter and review marks for your assigned subject." active="My Gradebook" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role="Teacher">
    <div className="module-workspace">
      <section className="module-card module-setup-card">
        <div><span className="module-overline">Teacher gradebook</span><h3>{data.assignment.class.name} · {data.assignment.subject.name}</h3><p>{data.selectedTerm ? `${data.selectedTerm.name} · ${data.readOnly ? "Historical / read-only" : "Active term"}` : "No active academic term"} · {data.performance?.rows.length ?? 0} active learners</p></div>
        <Link className="button secondary" href="/teacher/gradebook">← My gradebooks</Link>
      </section>
      {data.selectedTerm && data.readOnly ? <section className="module-card"><div className="module-notice"><strong>This is not the active school term.</strong><p>Marks are read-only here. Teachers cannot reopen or continue entering results after a term ends; leadership controls term finalisation.</p></div></section> : null}
      {!data.selectedTerm || !data.performance ? <section className="module-card module-empty"><strong>No academic term is available.</strong><p>School leadership controls the academic calendar. Your current markbook appears automatically when a live term is configured.</p></section> : <>
        <section className="module-metrics"><article><span>Learners</span><strong>{data.performance.rows.length}</strong></article><article><span>Assessments</span><strong>{data.performance.assessments.length}</strong></article><article><span>Teaching weeks</span><strong>{data.teachingWeeks}</strong></article><article><span>Term state</span><strong>{data.lifecycle?.state ?? "—"}</strong></article></section>
        <section className="module-card" id="marks"><div className="module-section-title"><div><span>Focused mark sheet</span><h3>{data.readOnly ? "Review marks" : "Record marks"}</h3></div>{!data.readOnly ? <Link href="/teacher/studio#activities" className="button secondary">Create online assessment →</Link> : null}</div>
          {!data.readOnly ? <TeacherQuickMarkSheet classId={classId} subjectId={subjectId} termId={data.selectedTerm.id} teachingWeeks={data.teachingWeeks} termStart={data.selectedTerm.startDate.toISOString().slice(0,10)} termEnd={data.selectedTerm.endDate.toISOString().slice(0,10)} /> : null}
          {data.performance.assessments.length === 0 ? <div className="module-empty"><strong>No mark sheets yet.</strong><span>Use Record marks above for ordinary classwork, homework, exercises, quizzes, participation or exams. Use Create online assessment only when learners need questions to answer in SukuuNova.</span></div> :
            <GradebookEntryGrid key={context + ":" + data.selectedTerm.id + ":" + data.performance.assessments.length} locked={data.readOnly || data.selectedTerm.isLocked}
              assessments={data.performance.assessments} gradeScale={data.gradeScale}
              rules={{ categories: data.performance.config.categories, rounding: data.performance.config.rounding, missingScorePolicy: data.performance.config.missingScorePolicy }}
              rows={data.performance.rows.map(row => ({ student: row.student, total: row.total, scores: row.scores.map(score => ({ assessmentId: score.assessmentId, expected: score.expected, rawScore: score.rawScore, maxScore: score.maxScore, status: score.status })) }))} />}
        </section>
        <section className="module-card"><div className="module-section-title"><div><span>Term archive</span><h3>Open a previous term read-only</h3></div></div><div className="module-actions">{data.terms.filter(term=>term.id!==data.selectedTerm?.id).slice(0,8).map(term=><Link key={term.id} className="button secondary" href={`${contextPath}?term=${encodeURIComponent(term.id)}`}>{term.name}{term.isLocked?" · locked":""}</Link>)}</div></section>
      </>}
    </div>
  </AppShell>;
}
