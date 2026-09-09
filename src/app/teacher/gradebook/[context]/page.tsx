import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { getGradebookConfiguration, getClassSubjectPerformance } from "@/lib/academic-engine";
import GradebookEntryGrid from "@/components/GradebookEntryGrid";
import "@/app/school/module-workspace.css";
import "@/app/school/academic-workspace.css";
import "@/app/school/gradebook/studio/gradebook-entry.css";

export default async function TeacherGradebookContextPage({ params }: { params: Promise<{ context: string }> }) {
  const session = await requireSchoolSession();
  const { context } = await params;
  const [classId, subjectId] = context.split("__", 2).map(decodeURIComponent);
  if (!classId || !subjectId) return null;

  const data = await withTenant(session.schoolId, async (tx) => {
    if (!(await hasPermission(tx, session.userId, "scores:write:assigned"))) throw new Error("You do not have gradebook access.");
    const [school, config] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getGradebookConfiguration(tx)
    ]);
    const assignment = config.assignments.find((item) => item.classId === classId && item.subjectId === subjectId && item.teacherId === session.userId);
    if (!assignment) throw new Error("This class-subject gradebook is not assigned to you.");
    const selectedTerm = config.terms[0];
    if (!selectedTerm) throw new Error("No academic term is configured.");
    const performance = await getClassSubjectPerformance(tx, classId, subjectId, selectedTerm.id);
    return { school, assignment, selectedTerm, performance };
  });

  return <AppShell universe="teacher" title="My gradebook" subtitle="Enter marks." active="My Gradebook" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name} role="Teacher">
    <div className="module-workspace">
      <section className="module-card module-setup-card">
        <div><span className="module-overline">Teacher gradebook</span><h3>{data.assignment.class.name} · {data.assignment.subject.name}</h3><p>{data.selectedTerm.name} · {data.performance.rows.length} learners · server-enforced teacher assignment.</p></div>
        <Link className="button secondary" href="/teacher/gradebook">← My gradebooks</Link>
      </section>
      <section className="module-metrics"><article><span>Learners</span><strong>{data.performance.rows.length}</strong></article><article><span>Assessments</span><strong>{data.performance.assessments.length}</strong></article></section>
      <section className="module-card" id="marks"><div className="module-section-title"><div><span>Focused mark sheet</span><h3>Enter marks</h3></div></div>{data.performance.assessments.length===0?<div className="module-empty"><strong>No assessments configured yet.</strong><span>Ask an academic administrator to configure the assessment structure.</span><Link className="button secondary" href="/teacher/gradebook">Back to assignments</Link></div>:<GradebookEntryGrid key={context + ":" + data.selectedTerm.id} locked={data.selectedTerm.isLocked} assessments={data.performance.assessments} rules={{ categories: data.performance.config.categories, rounding: data.performance.config.rounding, missingScorePolicy: data.performance.config.missingScorePolicy }} rows={data.performance.rows.map((row)=>({student:row.student,total:row.total,scores:row.scores.map((score)=>({assessmentId:score.assessmentId,expected:score.expected,rawScore:score.rawScore,maxScore:score.maxScore,status:(score as { status?: string }).status ?? null}))}))}/>}</section>
    </div>
  </AppShell>;
}
