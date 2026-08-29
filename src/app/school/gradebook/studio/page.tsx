import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission, hasPermission } from "@/lib/rbac";
import { getGradebookConfiguration, getClassSubjectPerformance } from "@/lib/academic-engine";
import GradebookEntryGrid from "@/components/GradebookEntryGrid";
import "../../module-workspace.css";

export default async function GradebookStudioPage({ searchParams }: { searchParams: Promise<{ class?: string; subject?: string; term?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "scores:write:assigned");
    const [school, config, canWriteAll] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getGradebookConfiguration(tx),
      hasPermission(tx, session.userId, "scores:write:all")
    ]);
    const assignment = config.assignments.find((item) => item.classId === params.class && item.subjectId === params.subject && (canWriteAll || item.teacherId === session.userId));
    const selectedTerm = config.terms.find((item) => item.id === params.term) ?? config.terms[0];
    let performance = null;
    if (assignment && selectedTerm) performance = await getClassSubjectPerformance(tx, assignment.classId, assignment.subjectId, selectedTerm.id);
    return { school, config, assignment, selectedTerm, performance, canWriteAll };
  });

  const assignments = data.config.assignments.filter((item) => data.canWriteAll || item.teacherId === session.userId);
  const selected = data.assignment;
  return (
    <AppShell universe="school" title="Gradebook Studio" subtitle="Enter marks quickly, catch errors early, and let SukuuNova calculate the weighted result for you." active="Gradebook Studio" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
      <div className="module-workspace">
        <section className="module-setup-card module-card">
          <div><span className="module-overline">Mark entry & results</span><h3>A faster way to finish your marks.</h3><p>Choose a teaching assignment, enter the marks directly in the sheet, and move through the class without leaving the page. The school’s weighting rules remain visible and the server still checks every save.</p></div>
          <div className="module-setup-list"><Link href="#selector"><span>1</span>Choose context <b>Class + subject + term</b></Link><Link href="#marks"><span>2</span>Enter the marks <b>One student row at a time</b></Link><Link href="/school/academics/health"><span>3</span>Run readiness <b>Catch incomplete work</b></Link><Link href="/school/academics/term-completion"><span>4</span>Finish the term <b>Check the whole reporting chain</b></Link></div>
        </section>

        <section className="module-card" id="selector"><div className="module-section-title"><div><span>Gradebook context</span><h3>Your teaching assignments</h3><p>Only assignments within your permitted scope appear here. Academic leaders can see a wider school set.</p></div></div>
          <div className="module-selector-grid">
            {assignments.length === 0 ? <div className="module-empty">No teaching assignments are available to this account yet.</div> : assignments.map((item) => <Link key={`${item.classId}:${item.subjectId}:${item.teacherId}`} href={`/school/gradebook/studio?class=${item.classId}&subject=${item.subjectId}&term=${data.selectedTerm?.id ?? ""}`} className={`module-selector-card ${selected && selected.classId === item.classId && selected.subjectId === item.subjectId ? "selected" : ""}`}><strong>{item.class.level ? `${item.class.level} · ` : ""}{item.class.name}</strong><span>{item.subject.name}</span><small>{item.teacher.name}</small></Link>)}
          </div>
        </section>

        {selected && data.performance ? <>
          <section className="module-metrics"><article><span>Class</span><strong>{selected.class.name}</strong><small>{selected.class.level ?? "Academic group"}</small></article><article><span>Subject</span><strong>{selected.subject.name}</strong><small>{selected.teacher.name}</small></article><article><span>Students</span><strong>{data.performance.rows.length}</strong><small>Active learners in class</small></article><article><span>Assessments</span><strong>{data.performance.assessments.length}</strong><small>Configured for the term</small></article></section>

          <section className="module-card" id="marks"><div className="module-section-title"><div><span>Live mark sheet</span><h3>{selected.subject.name} · {selected.class.name}</h3><p>Enter a mark and leave the cell. SukuuNova validates the range and saves it through the protected score endpoint.</p></div></div>
            {data.performance.assessments.length === 0 ? <div className="module-empty">No assessments have been created for this class, subject and term yet. Create one from the assessment workspace before entering marks.</div> : <GradebookEntryGrid assessments={data.performance.assessments} rows={data.performance.rows.map((row) => ({ student: row.student, total: row.total, scores: row.scores.map((score) => ({ assessmentId: score.assessmentId, rawScore: score.rawScore, maxScore: score.maxScore })) }))} />}
          </section>

          <section className="module-card"><div className="module-section-title"><div><span>School rules</span><h3>Assessment weights</h3><p>These are the rules that control weighted results for this workspace.</p></div></div><div className="module-workflow">{data.config.assessment.categories.map((category, index) => <div className="module-workflow-step" key={category.name}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{category.name}</strong><small>{category.weight}% of the final configured result</small></div></div>)}</div></section>
        </> : <section className="module-card"><div className="module-empty">Choose a class and subject above to open its gradebook.</div></section>}
      </div>
    </AppShell>
  );
}
