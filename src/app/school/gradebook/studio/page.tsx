import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { getGradebookConfiguration, getClassSubjectPerformance } from "@/lib/academic-engine";
import GradebookEntryGrid from "@/components/GradebookEntryGrid";
import "../../module-workspace.css";

export default async function GradebookStudioPage({ searchParams }: { searchParams: Promise<{ class?: string; subject?: string; term?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    const canWriteAssigned = await hasPermission(tx, session.userId, "scores:write:assigned");
    const canWriteAll = await hasPermission(tx, session.userId, "scores:write:all");
    if (!canWriteAssigned && !canWriteAll) throw new Error("You do not have gradebook access.");
    const [school, config] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getGradebookConfiguration(tx)
    ]);
    const assignments = config.assignments.filter((item) => canWriteAll || item.teacherId === session.userId);
    const selectedClass = params.class || "";
    const selectedSubject = params.subject || "";
    const selectedTerm = config.terms.find((item) => item.id === params.term) ?? config.terms[0];
    const matching = assignments.filter((item) => (!selectedClass || item.classId === selectedClass) && (!selectedSubject || item.subjectId === selectedSubject));
    const assignment = matching.find((_item) => selectedClass && selectedSubject) ?? null;
    let performance = null;
    if (assignment && selectedTerm) performance = await getClassSubjectPerformance(tx, assignment.classId, assignment.subjectId, selectedTerm.id);
    return { school, config, assignments, assignment, selectedTerm, performance, canWriteAll };
  });
  const classes = Array.from(new Map(data.assignments.map((item) => [item.classId, item.class])).values()).sort((a,b) => `${a.level??""}${a.name}`.localeCompare(`${b.level??""}${b.name}`));
  const subjects = Array.from(new Map(data.assignments.filter((item) => !params.class || item.classId === params.class).map((item) => [item.subjectId, item.subject])).values()).sort((a,b) => a.name.localeCompare(b.name));
  const terms = data.config.terms;
  return <AppShell universe="school" title="Gradebook Studio" subtitle="Mark entry." active="Gradebook Studio" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="module-workspace">
      <section className="module-setup-card module-card"><div><span className="module-overline">Mark entry & moderation</span><h3>{data.canWriteAll ? "School-wide academic view" : "Your teaching gradebooks"}</h3></div><div className="module-setup-list"><Link href="/school/academics/health"><span>1</span>Readiness <b>Check blockers</b></Link><Link href="/school/academics/performance"><span>2</span>Performance <b>Analyse results</b></Link></div></section>
      <section className="module-card" id="selector"><div className="module-section-title"><div><span>Gradebook context</span><h3>Choose the working context</h3></div></div><form className="module-toolbar" action="/school/gradebook/studio" method="get"><label style={{display:"grid",gap:5,fontSize:10,fontWeight:800,flex:1}>Class<select name="class" defaultValue={params.class ?? ""}><option value="">Choose class</option>{classes.map(item=><option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label><label style={{display:"grid",gap:5,fontSize:10,fontWeight:800,flex:1}>Subject<select name="subject" defaultValue={params.subject ?? ""}><option value="">Choose subject</option>{subjects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label style={{display:"grid",gap:5,fontSize:10,fontWeight:800,flex:1}>Term<select name="term" defaultValue={data.selectedTerm?.id ?? ""}>{terms.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="button primary" type="submit">Open gradebook</button></form>{params.class || params.subject ? <div className="module-empty" style={{marginTop:12}><strong>{data.assignment ? `${data.assignment.class.level ? data.assignment.class.level + " · " : ""}${data.assignment.class.name} · ${data.assignment.subject.name}` : "Context not available"}</strong></div> : null}</section>
      {data.assignment && data.performance ? <><section className="module-metrics"><article><span>Class</span><strong>{data.assignment.class.name}</strong><small>{data.assignment.class.level ?? "Academic group"}</small></article><article><span>Subject</span><strong>{data.assignment.subject.name}</strong><small>{data.assignment.teacher.name}</small></article><article><span>Learners</span><strong>{data.performance.rows.length}</strong><small>Students in this class</small></article><article><span>Assessments</span><strong>{data.performance.assessments.length}</strong><small>{data.selectedTerm?.name ?? "Term"}</small></article></section><section className="module-card" id="marks"><div className="module-section-title"><div><span>Focused mark sheet</span><h3>{data.assignment.subject.name} · {data.assignment.class.name}</h3></div></div>{data.performance.assessments.length===0?<div className="module-empty"><strong>No assessments configured yet.</strong><span>Create the assessment structure first in Exams & Assessments.</span><Link className="button secondary" href="/school/exams">Open assessments</Link></div>:<GradebookEntryGrid assessments={data.performance.assessments} rules={{ categories: data.config.assessment.categories, rounding: data.config.assessment.rounding, missingScorePolicy: data.config.assessment.missingScorePolicy }} rows={data.performance.rows.map((row)=>({student:row.student,total:row.total,scores:row.scores.map((score)=>({assessmentId:score.assessmentId,rawScore:score.rawScore,maxScore:score.maxScore,status:(score as { status?: string }).status ?? null}))}))}/>}</section><section className="module-card"><div className="module-section-title"><div><span>Calculation rule</span><h3>Assessment weights</h3></div></div><div className="module-workflow">{data.config.assessment.categories.map((category,index)=><div className="module-workflow-step" key={category.name}><span>{String(index+1).padStart(2,"0")}</span><div><strong>{category.name}</strong><small>{category.weight}% of the final configured result</small></div></div>)}</div></section></> : <section className="module-card"><div className="module-empty"><strong>Choose a class and subject.</strong></div></section>}
    </div>
  </AppShell>;
}
