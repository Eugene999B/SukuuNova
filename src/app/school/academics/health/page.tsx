import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AcademicWorkspaceNav } from "@/components/AcademicWorkspaceNav";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import "./academic-readiness.css";
import "../../academic-workspace.css";

export default async function AcademicHealthPage(){
  const session=await requireSchoolSession();
  const data=await withTenant(session.schoolId,async tx=>{
    await requirePermission(tx,session.userId,"settings:manage_school");
    const [school,classes,assignments,students,terms,assessments,reportCards,academic]=await Promise.all([
      tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}),
      tx.class.findMany({select:{id:true,name:true,level:true,subjectAssignments:{select:{subjectId:true,teacherId:true}}},orderBy:[{level:"asc"},{name:"asc"}]}),
      tx.classSubjectTeacher.findMany({select:{classId:true,subjectId:true,teacherId:true,class:{select:{name:true}},subject:{select:{name:true}},teacher:{select:{name:true}}}}),
      tx.student.findMany({where:{status:"active"},select:{id:true,classId:true}}),
      tx.term.findMany({include:{academicYear:true},orderBy:[{startDate:"desc"},{name:"asc"}],take:12}),
      tx.assessment.count({where:{schoolId:session.schoolId}}),
      tx.reportCard.count({where:{schoolId:session.schoolId}}),
      getAcademicEngineConfig(tx)
    ]);
    return {school,classes,assignments,students,terms,assessments,reportCards,academic};
  });
  const timetable=data.academic.timetable as {days:Array<{enabled:boolean;start:string;end:string}>;periodMinutes:number;breaks:Array<{name:string;start:string;end:string}>;periodsPerDay:number};
  const assessment=data.academic.assessment as {categories:Array<{name:string;weight:number}>};
  const totalWeight=assessment.categories.reduce((sum,row)=>sum+Number(row.weight),0);
  const unplaced=data.students.filter((student)=>!student.classId).length;
  const classesWithoutSubjects=data.classes.filter((row)=>row.subjectAssignments.length===0).length;
  const teacherCount=new Set(data.assignments.map((row)=>row.teacherId)).size;
  const termSet=data.terms.length>0;
  const readinessChecks=[
    {label:"Academic calendar",detail:termSet?`${data.terms.length} term(s) connected`:"Create the academic year and first term",ok:termSet,href:"/school/terms"},
    {label:"School day & timetable rules",detail:timetable.days.some((day)=>day.enabled)?`${timetable.days.filter((day)=>day.enabled).length} teaching day(s) · ${timetable.periodMinutes} min default`:"Set teaching days and lesson times",ok:timetable.days.some((day)=>day.enabled),href:"/school/academics/setup"},
    {label:"Assessment configuration",detail:`${totalWeight}% weighted · ${assessment.categories.length} category(s)`,ok:Math.abs(totalWeight-100)<0.01,href:"/school/academics/setup"},
    {label:"Class curriculum coverage",detail:classesWithoutSubjects?`${classesWithoutSubjects} class(es) have no subject offerings`:`${data.classes.length} class(es) have subject coverage`,ok:classesWithoutSubjects===0,href:"/school/subjects"},
    {label:"Teacher ownership",detail:data.assignments.length?`${teacherCount} teacher(s) · ${data.assignments.length} class/subject assignment(s)`:"No class · subject · teacher assignments",ok:data.assignments.length>0,href:"/school/classes"},
    {label:"Learner placement",detail:unplaced?`${unplaced} active learner(s) without a class`:`All ${data.students.length} active learner(s) are placed`,ok:unplaced===0,href:"/school/students"}
  ];
  const passed=readinessChecks.filter((row)=>row.ok).length;
  const score=Math.round((passed/readinessChecks.length)*100);
  const currentTerm=data.terms.find((term)=>{const now=new Date();return now>=term.startDate&&now<=term.endDate;})??data.terms[0];
  const stage=score===100?"Ready to operate":score>=75?"Nearly ready":"Needs configuration";
  return <AppShell universe="school" title="Academic Readiness" subtitle="Know whether the academic chain is ready." active="Academic Readiness" schoolName={data.school?.name??"School Workspace"} schoolCode={data.school?.uniqueCode??""} userName={session.name} role="Academic leadership">
    <div className="academic-page">
      <section className="academic-page-hero"><div className="academic-page-hero-copy"><span className="academic-page-overline">ACADEMIC READINESS · PREFLIGHT</span><h1>Check the whole chain before the school starts using it.</h1><p>Readiness connects calendar, timetable rules, assessments, curriculum, teaching ownership and learner placement. Fix issues here before they become gradebook or reporting problems.</p></div><div className="academic-page-hero-side"><div className="academic-page-context"><span className="academic-context-chip"><strong>Term</strong> {currentTerm?`${currentTerm.name} · ${currentTerm.academicYear.name}`:"No term"}</span><span className="academic-context-chip"><strong>Status</strong> {stage}</span><span className="academic-context-chip"><strong>Score</strong> {score}%</span></div><div className="academic-page-actions"><Link className="academic-btn-secondary" href="/school/academics/setup">Open setup</Link><Link className="academic-btn-secondary" href="/school/gradebook/studio">Open gradebook</Link></div></div></section>
      <AcademicWorkspaceNav current="readiness" />
      <section className="academic-step-row"><div className="academic-step-card"><span className="academic-step-number">01</span><div><strong>Calendar</strong><small>{termSet?"Academic period exists":"Create the first term"}</small></div></div><div className="academic-step-card"><span className="academic-step-number">02</span><div><strong>Teaching model</strong><small>{data.assignments.length?"Assignments connected":"Assign subjects to teachers"}</small></div></div><div className="academic-step-card"><span className="academic-step-number">03</span><div><strong>Results</strong><small>{Math.abs(totalWeight-100)<0.01?"Weights are valid":"Fix assessment weights"}</small></div></div><div className="academic-step-card"><span className="academic-step-number">04</span><div><strong>Reporting</strong><small>{data.reportCards} report records stored</small></div></div></section>
      <div className="readiness-shell"><section className="readiness-kpis"><article><span>Foundation checks</span><strong>{passed}/{readinessChecks.length}</strong><small>Configuration items passed</small></article><article><span>Classes</span><strong>{data.classes.length}</strong><small>{classesWithoutSubjects?`${classesWithoutSubjects} need subject coverage`:"Curriculum coverage OK"}</small></article><article><span>Teaching links</span><strong>{data.assignments.length}</strong><small>Class · subject · teacher relationships</small></article><article><span>Active learners</span><strong>{data.students.length}</strong><small>{unplaced?`${unplaced} unplaced`:"All placed in classes"}</small></article><article><span>Assessments</span><strong>{data.assessments}</strong><small>School-wide assessment records</small></article><article><span>Report cards</span><strong>{data.reportCards}</strong><small>Generated / stored records</small></article></section><section className="readiness-layout"><div className="readiness-card"><div className="readiness-card-head"><div><span className="readiness-kicker">PRE-FLIGHT CHECK</span><h3>What the academic system needs</h3></div><span className={`readiness-state ${score===100?"good":"warn"}`}>{score===100?"All clear":"Review items"}</span></div><div className="readiness-checks">{readinessChecks.map((check,index)=><div className={`readiness-check ${check.ok?"ready":"attention"}`} key={check.label}><span className="readiness-index">{String(index+1).padStart(2,"0")}</span><div className="readiness-check-copy"><b>{check.label}</b><small>{check.detail}</small></div><span className="readiness-check-status">{check.ok?"Ready":"Needs attention"}</span><Link href={check.href}>Open →</Link></div>)}</div></div><aside className="readiness-card readiness-side"><div className="readiness-card-head"><div><span className="readiness-kicker">OPERATING MODEL</span><h3>Keep the responsibilities explicit</h3></div></div><div className="role-panels"><div><span className="role-icon">O</span><div><b>Owner</b></div></div><div><span className="role-icon">P</span><div><b>Principal / Vice Principal</b></div></div><div><span className="role-icon">T</span><div><b>Teachers</b></div></div><div><span className="role-icon">S</span><div><b>Support & specialist staff</b></div></div></div><div className="readiness-actions"><Link href="/school/settings/access" className="readiness-action">Manage people & roles <span>→</span></Link><Link href="/teacher" className="readiness-action">Open teacher workspace <span>→</span></Link></div></aside></section><section className="readiness-footer"><div><span className="readiness-kicker">CONNECTED ACADEMIC CHAIN</span><h3>Setup → calendar → assignment → teaching → gradebook → performance → report cards</h3></div><div className="chain"><span>01 Setup</span><i>→</i><span>02 Calendar</span><i>→</i><span>03 Assign</span><i>→</i><span>04 Enter</span><i>→</i><span>05 Review</span><i>→</i><span>06 Report</span></div></section></div>
    </div>
  </AppShell>;
}
