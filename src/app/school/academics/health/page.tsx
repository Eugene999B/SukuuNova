import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AcademicWorkspaceNav } from "@/components/AcademicWorkspaceNav";
import { requirePermission } from "@/lib/rbac";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { getAcademicEngineConfig } from "@/lib/academic-engine";
import { isTermActive } from "@/lib/term-date";
import "./academic-readiness.css";
import "../../academic-workspace.css";

export default async function AcademicHealthPage(){
  const session=await requireSchoolSession();
  const data=await withTenant(session.schoolId,async tx=>{
    await requirePermission(tx,session.userId,"settings:manage_school");
    const [school,classes,assignments,students,terms,assessments,reportCards,academic,settings]=await Promise.all([
      tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}),
      tx.class.findMany({select:{id:true,name:true,level:true,subjectAssignments:{select:{subjectId:true,teacherId:true}}},orderBy:[{level:"asc"},{name:"asc"}]}),
      tx.classSubjectTeacher.findMany({select:{classId:true,subjectId:true,teacherId:true,class:{select:{name:true}},subject:{select:{name:true}},teacher:{select:{name:true}}}}),
      tx.student.findMany({where:{schoolId:session.schoolId,status:"active"},select:{id:true,classId:true}}),
      tx.term.findMany({where:{schoolId:session.schoolId},include:{academicYear:true},orderBy:[{startDate:"desc"},{name:"asc"}]}),
      tx.assessment.count({where:{schoolId:session.schoolId}}),
      tx.reportCard.count({where:{schoolId:session.schoolId}}),
      getAcademicEngineConfig(tx),
      tx.schoolSettings.findUnique({where:{schoolId:session.schoolId},select:{reportCardTemplateId:true,timezone:true}}),
    ]);
    const currentTerm=terms.find((term)=>isTermActive(term,new Date(),settings?.timezone||"Africa/Accra"))??null;
    const [termAssessments,termScores,reportTemplate]=currentTerm?await Promise.all([
      tx.assessment.count({where:{schoolId:session.schoolId,termId:currentTerm.id}}),
      tx.score.count({where:{schoolId:session.schoolId,assessment:{termId:currentTerm.id}}}),
      tx.reportCardTemplate.findUnique({where:{id:settings?.reportCardTemplateId??"preset-classic-blue"},select:{id:true,name:true}}),
    ]):[0,0,null];
    return {school,classes,assignments,students,terms,assessments,reportCards,academic,settings,currentTerm,termAssessments,termScores,reportTemplate};
  });
  const timetable=data.academic.timetable as {days:Array<{enabled:boolean;start:string;end:string}>;periodMinutes:number;breaks:Array<{name:string;start:string;end:string}>;periodsPerDay:number;published?:boolean};
  const assessment=data.academic.assessment as {categories:Array<{name:string;weight:number}>};
  const totalWeight=assessment.categories.reduce((sum,row)=>sum+Number(row.weight),0);
  const unplaced=data.students.filter((student)=>!student.classId).length;
  const classesWithoutSubjects=data.classes.filter((row)=>row.subjectAssignments.length===0).length;
  const teacherCount=new Set(data.assignments.map((row)=>row.teacherId)).size;
  const termSet=data.terms.length>0;
  const termDatesValid=!!data.currentTerm&&data.currentTerm.startDate<data.currentTerm.endDate;
  const timetableReady=timetable.days.some((day)=>day.enabled)&&timetable.days.filter((day)=>day.enabled).every((day)=>day.end>day.start);
  const gradebookReady=data.termAssessments===0?false:data.termScores>0;
  const reportTemplateReady=Boolean(data.reportTemplate);
  const readinessChecks=[
    {label:"Academic calendar & term dates",detail:!termSet?"Create the academic year and first term":termDatesValid?`${data.terms.length} term(s) connected · active period has valid dates`:"No active term is currently in progress",ok:termSet&&termDatesValid,href:"/school/terms"},
    {label:"School day & timetable rules",detail:timetableReady?`${timetable.days.filter((day)=>day.enabled).length} teaching day(s) · ${timetable.periodMinutes} min default`:"Set valid teaching days and lesson times",ok:timetableReady,href:"/school/academics/setup"},
    {label:"Published timetable",detail:timetable.published?"Teaching schedule is marked published":"Timetable exists but is not published",ok:Boolean(timetable.published),href:"/school/timetable"},
    {label:"Assessment configuration",detail:`${totalWeight}% weighted · ${assessment.categories.length} category(s)`,ok:Math.abs(totalWeight-100)<0.01,href:"/school/academics/setup"},
    {label:"Class curriculum coverage",detail:classesWithoutSubjects?`${classesWithoutSubjects} class(es) have no subject offerings`:`${data.classes.length} class(es) have subject coverage`,ok:classesWithoutSubjects===0,href:"/school/subjects"},
    {label:"Teacher ownership",detail:data.assignments.length?`${teacherCount} teacher(s) · ${data.assignments.length} class/subject assignment(s)`:"No class · subject · teacher assignments",ok:data.assignments.length>0,href:"/school/classes"},
    {label:"Learner placement",detail:unplaced?`${unplaced} active learner(s) without a class`:`All ${data.students.length} active learner(s) are placed`,ok:unplaced===0,href:"/school/students"},
    {label:"Current-term gradebook activity",detail:!data.currentTerm?"No active term is currently in progress":data.termAssessments===0?"No assessments have been created for the active term":`${data.termAssessments} assessment(s) · ${data.termScores} score record(s)`,ok:gradebookReady,href:"/school/gradebook/studio"},
    {label:"Report-card template",detail:reportTemplateReady?`${data.reportTemplate?.name} is available for generation`:"No usable report-card template is configured",ok:reportTemplateReady,href:"/school/report-cards"}
  ];
  const passed=readinessChecks.filter((row)=>row.ok).length;
  const score=Math.round((passed/readinessChecks.length)*100);
  const currentTerm=data.currentTerm;
  const stage=score===100?"Ready to operate":score>=75?"Nearly ready":"Needs configuration";
  return <AppShell universe="school" title="Academic Readiness" subtitle="Know whether the academic chain is ready." active="Academic Readiness" schoolName={data.school?.name??"School Workspace"} schoolCode={data.school?.uniqueCode??""} userName={session.name} role="Academic leadership">
    <div className="academic-page"><section className="academic-page-hero"><div className="academic-page-hero-copy"><span className="academic-page-overline">ACADEMIC READINESS · PREFLIGHT</span><h1>Check the whole chain before the school starts using it.</h1><p>Readiness connects calendar, timetable rules, assessments, curriculum, teaching ownership, learner placement, live gradebook activity and reporting. Fix issues here before they become operational problems.</p></div><div className="academic-page-hero-side"><div className="academic-page-context"><span className="academic-context-chip"><strong>Term</strong> {currentTerm?`${currentTerm.name} · ${currentTerm.academicYear.name}`:"No active term"}</span><span className="academic-context-chip"><strong>Status</strong> {stage}</span><span className="academic-context-chip"><strong>Score</strong> {score}%</span></div><div className="academic-page-actions"><Link className="academic-btn-secondary" href={`/school/academics/setup${currentTerm?`?termId=${encodeURIComponent(currentTerm.id)}`:""}`}>Open setup</Link><Link className="academic-btn-secondary" href={`/school/gradebook/studio${currentTerm?`?term=${encodeURIComponent(currentTerm.id)}`:""}`}>Open gradebook</Link></div></div></section><AcademicWorkspaceNav current="readiness"/><section className="academic-step-row"><div className="academic-step-card"><span className="academic-step-number">01</span><div><strong>Calendar</strong><small>{termSet?currentTerm?"Active academic period":"Choose an active term":"Create the first term"}</small></div></div><div className="academic-step-card"><span className="academic-step-number">02</span><div><strong>Teaching model</strong><small>{data.assignments.length?"Assignments connected":"Assign subjects to teachers"}</small></div></div><div className="academic-step-card"><span className="academic-step-number">03</span><div><strong>Results</strong><small>{Math.abs(totalWeight-100)<0.01&&gradebookReady?"Rules + current-term activity":"Fix assessment / gradebook setup"}</small></div></div><div className="academic-step-card"><span className="academic-step-number">04</span><div><strong>Reporting</strong><small>{reportTemplateReady?`${data.reportCards} stored report record(s) · template ready`:"Configure a usable report template"}</small></div></div></section><div className="readiness-shell"><section className="readiness-kpis"><article><span>Readiness checks</span><strong>{passed}/{readinessChecks.length}</strong><small>Operational dependencies passed</small></article><article><span>Classes</span><strong>{data.classes.length}</strong><small>{classesWithoutSubjects?`${classesWithoutSubjects} need subject coverage`:"Curriculum coverage OK"}</small></article><article><span>Teaching links</span><strong>{data.assignments.length}</strong><small>Class · subject · teacher relationships</small></article><article><span>Active learners</span><strong>{data.students.length}</strong><small>{unplaced?`${unplaced} unplaced`:"All placed in classes"}</small></article><article><span>Term assessments</span><strong>{data.termAssessments}</strong><small>{data.termScores} score record(s) in the active term</small></article><article><span>Report cards</span><strong>{data.reportCards}</strong><small>{reportTemplateReady?"Template ready":"Template needs attention"}</small></article></section><section className="readiness-layout"><div className="readiness-card"><div className="readiness-card-head"><div><span className="readiness-kicker">PRE-FLIGHT CHECK</span><h3>What the academic system needs</h3></div><span className={`readiness-state ${score===100?"good":"warn"}`}>{score===100?"All clear":"Review items"}</span></div><div className="readiness-checks">{readinessChecks.map((check,index)=><div className={`readiness-check ${check.ok?"ready":"attention"}`} key={check.label}><span className="readiness-index">{String(index+1).padStart(2,"0")}</span><div className="readiness-check-copy"><b>{check.label}</b><small>{check.detail}</small></div><span className="readiness-check-status">{check.ok?"Ready":"Needs attention"}</span><Link href={check.href}>Open →</Link></div>)}</div></div><aside className="readiness-card readiness-side"><div className="readiness-card-head"><div><span className="readiness-kicker">OPERATING MODEL</span><h3>Keep the responsibilities explicit</h3></div></div><div className="role-panels"><div><span className="role-icon">O</span><div><b>Owner</b></div></div><div><span className="role-icon">P</span><div><b>Principal / Vice Principal</b></div></div><div><span className="role-icon">T</span><div><b>Teachers</b></div></div><div><span className="role-icon">S</span><div><b>Support & specialist staff</b></div></div></div><div className="readiness-actions"><Link href="/school/settings/access" className="readiness-action">Manage people & roles <span>→</span></Link><Link href="/teacher" className="readiness-action">Open teacher workspace <span>→</span></Link></div></aside></section><section className="readiness-footer"><div><span className="readiness-kicker">CONNECTED ACADEMIC CHAIN</span><h3>Setup → calendar → assignment → timetable → teaching → gradebook → performance → report cards → guardian release</h3></div><div className="chain"><span>01 Setup</span><i>→</i><span>02 Calendar</span><i>→</i><span>03 Assign</span><i>→</i><span>04 Timetable</span><i>→</i><span>05 Enter</span><i>→</i><span>06 Review</span><i>→</i><span>07 Report</span></div></section></div></div></AppShell>;
}
